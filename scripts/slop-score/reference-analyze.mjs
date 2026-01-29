#!/usr/bin/env node
// reference-analyze.mjs - Generate reference fixture from existing JS implementation
// Usage: node reference-analyze.mjs data/test.txt > scripts/slop-score/fixtures/test.txt.expected.json

import { readFileSync } from 'fs';
import { join, basename } from 'path';

import {
  loadWordfreq,
  loadHumanProfile,
  loadSlopSets,
  computeSlopIndex,
  contentTokens,
  makeNgrams,
  rankOveruseWithCounts,
  lookupFrequency,
  mergePossessives,
  humanBigramFreq,
  humanTrigramFreq
} from '../../js/metrics.js';
import { wordsOnlyLower, alphaTokens, countItems } from '../../js/utils.js';
import { extractContrastMatches } from '../../js/contrast-detector.js';

// Patch global fetch to support local file paths for Node.js
const originalFetch = global.fetch;
global.fetch = async function(url, ...args) {
  if (url.startsWith('./') || url.startsWith('../')) {
    const content = readFileSync(url, 'utf-8');
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(content),
      text: async () => content
    };
  }
  return originalFetch(url, ...args);
};

// Disable console logging from contrast detector
const originalConsoleGroup = console.group;
const originalConsoleGroupEnd = console.groupEnd;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

function disableLogging() {
  console.group = () => {};
  console.groupEnd = () => {};
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

function enableLogging() {
  console.group = originalConsoleGroup;
  console.groupEnd = originalConsoleGroupEnd;
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
}

// Calculate Flesch-Kincaid grade level
function calculateFleschKincaid(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.match(/\b\w+\b/g) || [];

  if (sentences.length === 0 || words.length === 0) return 0;

  function countSyllables(word) {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const syllables = word.match(/[aeiouy]{1,2}/g);
    return syllables ? syllables.length : 1;
  }

  const totalSyllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const avgSyllablesPerWord = totalSyllables / words.length;
  const avgWordsPerSentence = words.length / sentences.length;

  const gradeLevel = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
  return Math.max(0, gradeLevel);
}

function calculateAverageSentenceLength(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.match(/\b\w+\b/g) || [];

  if (sentences.length === 0) return 0;
  return words.length / sentences.length;
}

function calculateAverageParagraphLength(text) {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const words = text.match(/\b\w+\b/g) || [];

  if (paragraphs.length === 0) return 0;
  return words.length / paragraphs.length;
}

function calculateDialogueFrequency(text) {
  const quotes = (text.match(/[""\u201C\u201D]/g) || []).length;
  const chars = text.length;

  if (chars === 0) return 0;
  return (quotes / 2 / chars) * 1000;
}

// Calculate MATTR-500 lexical diversity
function calculateLexicalDiversity(tokens) {
  const totalWords = tokens.length;
  const windowSize = 500;

  if (totalWords === 0) {
    return {
      mattr_500: 0,
      type_token_ratio: 0,
      unique_words: 0,
      total_words: 0
    };
  }

  const uniqueWords = new Set(tokens);
  const simpleTTR = uniqueWords.size / totalWords;

  let mattr = 0;
  if (totalWords >= windowSize) {
    let sumTTR = 0;
    let windowCount = 0;

    for (let i = 0; i <= totalWords - windowSize; i++) {
      const windowTokens = tokens.slice(i, i + windowSize);
      const windowUnique = new Set(windowTokens);
      const windowTTR = windowUnique.size / windowSize;
      sumTTR += windowTTR;
      windowCount++;
    }

    mattr = sumTTR / windowCount;
  } else {
    mattr = simpleTTR;
  }

  return {
    mattr_500: mattr,
    type_token_ratio: simpleTTR,
    unique_words: uniqueWords.size,
    total_words: totalWords
  };
}

// Normalization ranges computed from leaderboard_results.json
// These ranges have a 10% buffer added to min/max values
const NORMALIZATION_RANGES = {
  slop_words: { min: 2.1214882577844882, max: 43.924784489934034 },
  slop_trigrams: { min: -0.027052241145113065, max: 1.2293612202273094 },
  contrast: { min: -0.0323480255696472, max: 0.8881555162544392 }
};

// Normalize a value to 0-1 range based on the range object
function normalizeValue(value, range) {
  const normalized = (value - range.min) / (range.max - range.min);
  return Math.max(0, Math.min(1, normalized));
}

// Compute final slop score from components (matching slop-score.html formula)
// Uses weighted combination: 60% slop words + 25% contrast + 15% slop trigrams
function computeSlopScore(wordScore, trigramScore, contrastRate) {
  const normWords = normalizeValue(wordScore, NORMALIZATION_RANGES.slop_words);
  const normTrigrams = normalizeValue(trigramScore, NORMALIZATION_RANGES.slop_trigrams);
  const normContrast = normalizeValue(contrastRate, NORMALIZATION_RANGES.contrast);

  return (normWords * 0.6 + normContrast * 0.25 + normTrigrams * 0.15) * 100;
}

async function analyzeFile(filePath) {
  // Load dependencies
  await loadWordfreq();
  await loadHumanProfile();
  await loadSlopSets();

  // Read input file
  const text = readFileSync(filePath, 'utf-8');
  const chars = text.length;

  // Tokenize
  const toks0 = wordsOnlyLower(text);
  const toks = alphaTokens(toks0);
  const nWords = toks.length;

  if (nWords === 0) {
    throw new Error('No words found in input file');
  }

  // Slop index - now returns separate word and trigram scores
  const slopResult = computeSlopIndex(toks, true); // trackHits = true

  // Repetition score
  const toksContent = contentTokens(toks);
  const bigs = makeNgrams(toksContent, 2);
  const tris = makeNgrams(toksContent, 3);

  const topBCounts = rankOveruseWithCounts(bigs, humanBigramFreq, 40);
  const topTCounts = rankOveruseWithCounts(tris, humanTrigramFreq, 40);

  const top_bigram_count = topBCounts.reduce((s, r) => s + r[2], 0);
  const top_trigram_count = topTCounts.reduce((s, r) => s + r[2], 0);
  const content_word_count = toksContent.length;

  const repetition_score = content_word_count > 0
    ? ((top_bigram_count + top_trigram_count) / content_word_count) * 1000
    : 0;

  // Contrast patterns
  disableLogging();
  const contrastResult = extractContrastMatches(text);
  enableLogging();

  const contrastRate = chars > 0 ? (contrastResult.length / chars) * 1000 : 0;

  // Lexical diversity
  const lexicalDiversity = calculateLexicalDiversity(toks);

  // Additional writing metrics
  const vocabLevel = calculateFleschKincaid(text);
  const avgSentenceLength = calculateAverageSentenceLength(text);
  const avgParagraphLength = calculateAverageParagraphLength(text);
  const dialogueFrequency = calculateDialogueFrequency(text);

  // Compute final slop score
  const slopScore = computeSlopScore(
    slopResult.wordScore,
    slopResult.trigramScore,
    contrastRate
  );

  // Top over-represented words (vs wordfreq baseline)
  let wordCounts = countItems(toksContent);
  wordCounts = mergePossessives(wordCounts);

  const totalWords = Array.from(wordCounts.values()).reduce((a, b) => a + b, 0);
  const wordOverrep = [];

  for (const [w, cnt] of wordCounts.entries()) {
    const baselineFreq = lookupFrequency(w);
    if (!baselineFreq) continue;

    const modelFreq = cnt / totalWords;
    const ratio = modelFreq / baselineFreq;

    if (ratio > 1.5 && cnt >= 2) {
      wordOverrep.push({ word: w, ratio: ratio, count: cnt });
    }
  }
  wordOverrep.sort((a, b) => b.ratio - a.ratio);

  // Build output JSON
  const output = {
    file: basename(filePath),
    total_chars: chars,
    total_words: nWords,
    slop_score: slopScore,
    metrics: {
      slop_words_per_1k: slopResult.wordScore,
      slop_trigrams_per_1k: slopResult.trigramScore,
      ngram_repetition_score: repetition_score,
      not_x_but_y_per_1k_chars: contrastRate,
      lexical_diversity: lexicalDiversity,
      vocab_level: vocabLevel,
      avg_sentence_length: avgSentenceLength,
      avg_paragraph_length: avgParagraphLength,
      dialogue_frequency: dialogueFrequency
    },
    // Optional fields (always included in fixture for complete testing)
    slop_word_hits: slopResult.wordHits || [],
    slop_trigram_hits: slopResult.trigramHits || [],
    top_over_represented: {
      words: wordOverrep.slice(0, 100),
      bigrams: topBCounts.slice(0, 100).map(([phrase, ratio, count]) => ({
        phrase,
        ratio,
        count
      })),
      trigrams: topTCounts.slice(0, 100).map(([phrase, ratio, count]) => ({
        phrase,
        ratio,
        count
      }))
    },
    contrast_matches: contrastResult.slice(0, 100).map(m => ({
      pattern_name: m.pattern_name,
      sentence: m.sentence,
      match_text: m.match_text || '',
      sentence_count: m.sentence_count || 1
    }))
  };

  return output;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node reference-analyze.mjs <input-file>');
    console.error('Example: node reference-analyze.mjs data/test.txt');
    process.exit(1);
  }

  const inputFile = args[0];

  try {
    const result = await analyzeFile(inputFile);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
