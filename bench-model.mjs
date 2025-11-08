#!/usr/bin/env node
// -*- coding: utf-8 -*-

import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

// Load .env file
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Thread-safe file writing with lock
class FileLock {
  constructor() {
    this.locks = new Map();
  }

  async acquire(path) {
    while (this.locks.get(path)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.locks.set(path, true);
  }

  release(path) {
    this.locks.delete(path);
  }
}

const fileLock = new FileLock();

function nowIso() {
  return new Date().toISOString();
}

function safeModelId(modelId) {
  return modelId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function promptText(userPrompt) {
  return (
    'Write approximately 1,000 words on the following writing prompt. ' +
    'Do not use tables.\n\n' +
    `Prompt: ${userPrompt}`
  );
}

async function atomicUpdateResults(resultsPath, modelId, sample = null, completedAt = null) {
  await fileLock.acquire(resultsPath);

  try {
    let data = {};
    if (existsSync(resultsPath)) {
      try {
        data = JSON.parse(readFileSync(resultsPath, 'utf-8'));
      } catch (e) {
        console.error(`Warning: Could not parse existing results file: ${e.message}`);
      }
    }

    if (!data[modelId]) {
      data[modelId] = {
        test_model: modelId,
        samples: [],
      };
    }

    if (sample !== null) {
      // Find and update existing sample or append new one
      const existingIdx = data[modelId].samples.findIndex(
        s => s.prompt_index === sample.prompt_index
      );

      if (existingIdx >= 0) {
        data[modelId].samples[existingIdx] = sample;
      } else {
        data[modelId].samples.push(sample);
      }

      // Keep samples sorted by prompt_index
      data[modelId].samples.sort((a, b) => a.prompt_index - b.prompt_index);
    }

    if (completedAt !== null) {
      data[modelId].completed_at = completedAt;
    }

    // Ensure directory exists
    const dir = dirname(resultsPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(resultsPath, JSON.stringify(data, null, 2), 'utf-8');
  } finally {
    fileLock.release(resultsPath);
  }
}

function ensureModelHeader(resultsPath, modelId, endpoint, params, startedAt) {
  let data = {};
  if (existsSync(resultsPath)) {
    try {
      data = JSON.parse(readFileSync(resultsPath, 'utf-8'));
    } catch (e) {
      // Ignore parse errors for new files
    }
  }

  if (!data[modelId]) {
    data[modelId] = {
      test_model: modelId,
      endpoint: endpoint,
      params: params,
      started_at: startedAt,
      samples: [],
    };

    const dir = dirname(resultsPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(resultsPath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

function getCompletedPrompts(resultsPath, modelId) {
  if (!existsSync(resultsPath)) {
    return { generated: new Set(), samples: {} };
  }

  try {
    const data = JSON.parse(readFileSync(resultsPath, 'utf-8'));
    const modelData = data[modelId] || {};
    const samples = modelData.samples || [];

    const generated = new Set();
    const samplesByIdx = {};

    for (const sample of samples) {
      const idx = sample.prompt_index;
      if (idx === undefined) continue;

      samplesByIdx[idx] = sample;

      // Has output and no error = generated
      if (sample.output && !sample.error) {
        generated.add(idx);
      }
    }

    return { generated, samples: samplesByIdx };
  } catch (e) {
    return { generated: new Set(), samples: {} };
  }
}

async function generateWithRetry(client, model, prompt, maxTokens, maxRetries, retryDelay) {
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.generate(model, prompt, maxTokens);
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * 1000));
      }
    }
  }

  throw new Error(`Generate failed after ${maxRetries} retries: ${lastError?.message}`);
}

class ApiClient {
  constructor(baseUrl, apiKey, timeout = 120000, maxRetries = 3, retryDelay = 5) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.timeout = timeout;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.kind = this._detectKind(baseUrl);
  }

  _detectKind(baseUrl) {
    const u = baseUrl.toLowerCase();
    if (u.includes('anthropic')) return 'anthropic';
    if (u.includes('openrouter')) return 'openrouter';
    return 'openai';
  }

  async _request(method, url, headers, body) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      return await response.json();
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  }

  async generate(model, promptText, maxTokens = 2048) {
    if (this.kind === 'anthropic') {
      return this._anthropicGenerate(model, promptText, maxTokens);
    }
    return this._openaiCompatGenerate(model, promptText, maxTokens);
  }

  async _openaiCompatGenerate(model, promptText, maxTokens) {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const body = {
      model: model,
      messages: [
        { role: 'system', content: 'Write 1000 words on the provided writing prompt.' },
        { role: 'user', content: promptText },
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
    };

    // OpenRouter supports min_p
    if (this.kind === 'openrouter') {
      body.min_p = 0.1;
    }

    const data = await this._request('POST', this.baseUrl, headers, body);

    try {
      return data.choices[0].message.content;
    } catch (e) {
      throw new Error(`Bad response: ${JSON.stringify(data).substring(0, 1000)}`);
    }
  }

  async _anthropicGenerate(model, promptText, maxTokens) {
    const headers = {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };

    const body = {
      model: model,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [
        { role: 'user', content: promptText },
      ],
    };

    const data = await this._request('POST', this.baseUrl, headers, body);

    try {
      const parts = data.content || [];
      const texts = parts
        .filter(p => p.type === 'text')
        .map(p => p.text || '');
      return texts.join('\n').trim();
    } catch (e) {
      throw new Error(`Bad response: ${JSON.stringify(data).substring(0, 1000)}`);
    }
  }
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      model: { type: 'string' },
      'base-url': { type: 'string' },
      'api-key': { type: 'string' },
      prompts: { type: 'string', default: 'data/prompts.json' },
      results: { type: 'string' },
      workers: { type: 'string', default: '8' },
      timeout: { type: 'string', default: '480' },
      'max-tokens': { type: 'string', default: '8096' },
      'n-prompts': { type: 'string', default: '300' },
      'max-retries': { type: 'string', default: '3' },
      'retry-delay': { type: 'string', default: '5' },
    },
  });

  if (!args.model) {
    console.error('Error: --model is required');
    process.exit(1);
  }

  const baseUrl = args['base-url'] || process.env.BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
  const apiKey = args['api-key'] || process.env.API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('Error: --api-key or API_KEY/OPENAI_API_KEY environment variable is required');
    console.error('Tip: Create a .env file with BASE_URL and API_KEY');
    process.exit(1);
  }

  const modelId = args.model;
  const promptsPath = args.prompts;
  const resultsPath = args.results || `results/${safeModelId(modelId)}.json`;
  const workers = parseInt(args.workers);
  const timeout = parseFloat(args.timeout) * 1000; // Convert to ms
  const maxTokens = parseInt(args['max-tokens']);
  const nPrompts = parseInt(args['n-prompts']);
  const maxRetries = parseInt(args['max-retries']);
  const retryDelay = parseFloat(args['retry-delay']);

  // Load prompts
  const prompts = JSON.parse(readFileSync(promptsPath, 'utf-8'));
  if (!Array.isArray(prompts) || !prompts.every(p => typeof p === 'string')) {
    throw new Error('prompts.json must be a JSON array of strings');
  }

  const limitedPrompts = prompts.slice(0, nPrompts);

  const client = new ApiClient(baseUrl, apiKey, timeout, maxRetries, retryDelay);

  // Check for existing results
  const completed = getCompletedPrompts(resultsPath, modelId);
  const alreadyGenerated = completed.generated;
  const existingSamples = completed.samples;

  if (alreadyGenerated.size > 0) {
    console.log(`Found existing results: ${alreadyGenerated.size} already generated`);
    console.log('Resuming from checkpoint...');
  }

  // Write model header
  ensureModelHeader(
    resultsPath,
    modelId,
    baseUrl,
    {
      temperature: 0.7,
      min_p: 0.1,
      max_tokens: maxTokens,
      workers: workers,
      prompts_path: promptsPath,
    },
    nowIso()
  );

  // Generate list of prompts to process
  const promptsToGenerate = limitedPrompts
    .map((p, i) => ({ index: i, prompt: p }))
    .filter(({ index }) => !alreadyGenerated.has(index));

  if (promptsToGenerate.length === 0) {
    console.log(`All ${limitedPrompts.length} prompts already generated`);
    await atomicUpdateResults(resultsPath, modelId, null, nowIso());
    console.log(`\nResults saved to: ${resultsPath}`);
    return;
  }

  console.log(`Generating ${promptsToGenerate.length} outputs with ${workers} workers...`);
  console.log(`  (Skipping ${alreadyGenerated.size} already generated)`);

  // Process prompts in parallel with worker limit
  let completed_count = 0;
  let error_count = 0;

  const processPrompt = async ({ index, prompt }) => {
    try {
      const text = await generateWithRetry(
        client,
        modelId,
        promptText(prompt),
        maxTokens,
        maxRetries,
        retryDelay
      );

      const sample = {
        prompt_index: index,
        prompt: prompt,
        output: text,
      };

      await atomicUpdateResults(resultsPath, modelId, sample);
      completed_count++;
      process.stdout.write(`\rProgress: ${completed_count}/${promptsToGenerate.length} (${error_count} errors)`);
    } catch (e) {
      const sample = {
        prompt_index: index,
        prompt: prompt,
        output: '',
        error: e.message,
      };

      await atomicUpdateResults(resultsPath, modelId, sample);
      error_count++;
      process.stdout.write(`\rProgress: ${completed_count}/${promptsToGenerate.length} (${error_count} errors)`);
    }
  };

  // Run with concurrency limit
  const pool = [];
  for (const item of promptsToGenerate) {
    const promise = processPrompt(item);
    pool.push(promise);

    if (pool.length >= workers) {
      await Promise.race(pool);
      // Remove completed promises
      pool.splice(0, pool.length, ...pool.filter(p => {
        let done = false;
        p.then(() => { done = true; }).catch(() => { done = true; });
        return !done;
      }));
    }
  }

  // Wait for remaining
  await Promise.all(pool);
  console.log('\n');

  // Mark completion
  await atomicUpdateResults(resultsPath, modelId, null, nowIso());

  console.log('\nSUMMARY');
  console.log(`model=${modelId}`);
  console.log(`completed=${completed_count}  errors=${error_count}`);
  console.log(`results_file=${resultsPath}`);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
