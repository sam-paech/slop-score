// wordfreq.ts - Bun/TypeScript port of js/wordfreq.js
// Port of wordfreq for English word frequency lookups
// Based on https://github.com/rspeer/wordfreq by Robyn Speer
//
// Original Python library: https://github.com/rspeer/wordfreq
// Citation: Robyn Speer. (2022). rspeer/wordfreq: v3.0 (v3.0.2). Zenodo.
//           https://doi.org/10.5281/zenodo.7199437
//
// License:
// - Code: Apache License 2.0 (matches original wordfreq code license)
// - Data: Creative Commons Attribution-ShareAlike 4.0 (CC-BY-SA 4.0)

import { gunzipSync } from 'bun';
import { decode } from '@msgpack/msgpack';
import { join } from 'path';

// --- Basic English normalization ---
function uncurlQuotes(s: string): string {
  // Curly → straight quotes
  return s
    .replaceAll('\u2018', "'")
    .replaceAll('\u2019', "'")
    .replaceAll('\u201C', '"')
    .replaceAll('\u201D', '"');
}

function normalizeWord_en(s: string): string {
  // Lowercase, uncurl quotes, trim
  return uncurlQuotes(s).toLocaleLowerCase('en').trim();
}

// Light tokenizer for multi-token inputs
// Matches sequences of letters/digits with internal ' or - kept
const WORD_RE = /[A-Za-z0-9]+(?:[''-][A-Za-z0-9]+)*/g;

// Combine multi-token Zipf via min (conservative estimate)
function combineZipfSimple(tokens: string[], getZipf: (word: string) => number): number {
  if (tokens.length === 0) return 0.0;
  let z = Infinity;
  for (const t of tokens) z = Math.min(z, getZipf(t));
  return Number.isFinite(z) ? z : 0.0;
}

export class WordfreqEn {
  private map: Map<string, number>;
  private minZipf: number;

  constructor(map: Map<string, number>, minZipf: number = 0.0) {
    this.map = map; // Map<string, number> word -> zipf
    this.minZipf = minZipf; // default for OOV
  }

  zipfFrequency(input: string | null | undefined): number {
    if (!input || typeof input !== 'string') return 0.0;
    const text = normalizeWord_en(input);

    // If the input is a phrase, combine token Zipfs
    const tokens = text.match(WORD_RE) ?? [];
    if (tokens.length > 1) {
      return combineZipfSimple(tokens, (w) => this.map.get(w) ?? this.minZipf);
    }

    // Single token path
    return this.map.get(text) ?? this.minZipf;
  }

  // Return frequency as a proportion (0-1)
  // Zipf = log10(freq_per_billion) => freq_per_billion = 10^zipf
  // freq_proportion = freq_per_billion / 1e9 = 10^(zipf - 9)
  frequency(input: string): number {
    const zipf = this.zipfFrequency(input);
    if (zipf <= 0) return 0.0;
    return Math.pow(10, zipf - 9);
  }

  // Alias for getFrequency - compatibility method
  getFrequency(input: string): number {
    return this.frequency(input);
  }

  // Alias for zipfFrequency - compatibility method
  getZipf(input: string): number {
    return this.zipfFrequency(input);
  }
}

interface MsgpackHeader {
  format: string;
  version: number;
}

export async function loadWordfreq(dataDir: string): Promise<WordfreqEn> {
  const compressed = await Bun.file(join(dataDir, 'large_en.msgpack.gz')).arrayBuffer();
  const decompressed = gunzipSync(new Uint8Array(compressed));
  const data = decode(decompressed) as [MsgpackHeader, ...Array<string[] | null>];

  // Validate header
  const header = data[0];
  if (!header || header.format !== 'cB' || header.version !== 1) {
    throw new Error(`Unexpected format: ${JSON.stringify(header)}`);
  }

  // data is cBpack format: array where index i represents -i centibels
  // Zipf = (cB + 900) / 100, where cB = -index
  // So: Zipf = (-index + 900) / 100 = (900 - index) / 100
  const bins = data.slice(1); // Skip header
  const map = new Map<string, number>();

  for (let i = 0; i < bins.length; i++) {
    const words = bins[i];
    if (Array.isArray(words) && words.length > 0) {
      const cB = -i; // centibels (negative)
      const zipf = (cB + 900) / 100.0;

      for (const w of words) {
        map.set(w, zipf);
      }
    }
  }

  return new WordfreqEn(map, 0.0); // OOV default is 0.0
}
