// metrics.ts - Core text analysis metrics
// Port of js/metrics.js to TypeScript for Bun

import { gunzipSync } from 'bun';
import { join } from 'path';
import { loadWordfreq, WordfreqEn } from './wordfreq';
import { wordsOnlyLower, alphaTokens, countItems, getNgrams } from './utils';
import { extractContrastMatches, ContrastMatch } from './contrast-detector';

// NLTK English stopwords (179 words)
// Source: https://github.com/nltk/nltk_data/blob/gh-pages/packages/corpora/stopwords.zip
const STOPWORDS = new Set([
  "i","me","my","myself","we","our","ours","ourselves","you","your","yours",
  "yourself","yourselves","he","him","his","himself","she","her","hers","herself",
  "it","its","itself","they","them","their","theirs","themselves","what","which",
  "who","whom","this","that","these","those","am","is","are","was","were","be",
  "been","being","have","has","had","having","do","does","did","doing","a","an",
  "the","and","but","if","or","because","as","until","while","of","at","by","for",
  "with","about","against","between","into","through","during","before","after",
  "above","below","to","from","up","down","in","out","on","off","over","under",
  "again","further","then","once","here","there","when","where","why","how","all",
  "any","both","each","few","more","most","other","some","such","no","nor","not",
  "only","own","same","so","than","too","very","s","t","can","will","just","don",
  "should","now"
]);

// Known contractions that should NOT have 's removed
const KNOWN_CONTRACTIONS_S = new Set([
  "it's", "that's", "what's", "who's", "he's", "she's",
  "there's", "here's", "where's", "when's", "why's", "how's",
  "let's"
]);

// Module-level state
let wordfreq: WordfreqEn | null = null;
export let humanBigramFreq = new Map<string, number>();
export let humanTrigramFreq = new Map<string, number>();
let slopWords = new Set<string>();
let slopBigrams = new Set<string>();
let slopTrigrams = new Set<string>();

export function lookupZipf(word: string): number | null {
  if (!wordfreq) return null;

  const zipf = wordfreq.zipfFrequency(word);
  return zipf > 0 ? zipf : null;
}

export function lookupFrequency(word: string): number | null {
  if (!wordfreq) return null;

  const freq = wordfreq.frequency(word);
  return freq > 0 ? freq : null;
}

export function mergePossessives(wordCounts: Map<string, number>): Map<string, number> {
  const merged = new Map<string, number>();

  for (const [word, count] of wordCounts.entries()) {
    if (word.endsWith("'s") && !KNOWN_CONTRACTIONS_S.has(word)) {
      const baseWord = word.slice(0, -2);
      if (baseWord) {
        merged.set(baseWord, (merged.get(baseWord) || 0) + count);
        continue;
      }
    }
    merged.set(word, (merged.get(word) || 0) + count);
  }

  return merged;
}

export function filterNumericWords(wordCounts: Map<string, number>): Map<string, number> {
  const filtered = new Map<string, number>();

  for (const [word, count] of wordCounts.entries()) {
    const digitCount = (word.match(/\d/g) || []).length;
    if (word.length > 0 && (digitCount / word.length) > 0.2) {
      continue;
    }
    filtered.set(word, count);
  }

  return filtered;
}

export async function loadSlopSets(dataDir: string): Promise<void> {
  const loadSet = async (path: string): Promise<Set<string>> => {
    const outSet = new Set<string>();
    const content = await Bun.file(path).json();
    if (!Array.isArray(content)) return outSet;

    for (const item of content) {
      if (!item || !item.length) continue;
      const phrase = String(item[0]).toLowerCase().match(/[a-z]+(?:'[a-z]+)?(?:\s+[a-z]+(?:'[a-z]+)?)*/g);
      if (phrase) outSet.add(phrase[0]);
    }
    return outSet;
  };

  const [words, bigrams, trigrams] = await Promise.all([
    loadSet(join(dataDir, 'slop_list.json')),
    loadSet(join(dataDir, 'slop_list_bigrams.json')),
    loadSet(join(dataDir, 'slop_list_trigrams.json')),
  ]);

  slopWords = words;
  slopBigrams = bigrams;
  slopTrigrams = trigrams;
}

export async function loadHumanProfile(dataDir: string): Promise<void> {
  const compressed = await Bun.file(join(dataDir, 'human_writing_profile.json.gz')).arrayBuffer();
  const decompressed = gunzipSync(new Uint8Array(compressed));
  const j = JSON.parse(new TextDecoder().decode(decompressed));
  const hp = j["human-authored"] || j["human"] || j;

  function norm(list: any[], targetMap: Map<string, number>): void {
    if (!Array.isArray(list)) return;
    let total = 0;
    for (const it of list) {
      const f = Number(it.frequency) || 0;
      total += f;
    }
    if (total <= 0) return;
    for (const it of list) {
      const toks = String(it.ngram || "").toLowerCase().match(/[a-z]+/g);
      if (!toks || toks.length < 2) continue;
      targetMap.set(toks.join(" "), (Number(it.frequency) || 0) / total);
    }
  }

  humanBigramFreq = new Map();
  humanTrigramFreq = new Map();
  norm(hp.top_bigrams || hp.bigrams || [], humanBigramFreq);
  norm(hp.top_trigrams || hp.trigrams || [], humanTrigramFreq);
}

export async function loadAllData(dataDir: string): Promise<void> {
  await Promise.all([
    (async () => { wordfreq = await loadWordfreq(dataDir); })(),
    loadSlopSets(dataDir),
    loadHumanProfile(dataDir),
  ]);
}

export interface SlopIndexResult {
  wordScore: number;
  trigramScore: number;
  wordHits: [string, number][] | null;
  trigramHits: [string, number][] | null;
}

export function computeSlopIndex(tokens: string[], trackHits = false): SlopIndexResult {
  const n = tokens.length || 0;
  if (!n) return { wordScore: 0, trigramScore: 0, wordHits: null, trigramHits: null };

  let wordHitCount = 0, triHitCount = 0;
  const wordHitMap = trackHits ? new Map<string, number>() : null;
  const triHitMap = trackHits ? new Map<string, number>() : null;

  // Single-word matches only (slop_list.json)
  if (slopWords.size) {
    for (const t of tokens) {
      if (slopWords.has(t)) {
        wordHitCount++;
        if (trackHits && wordHitMap) {
          wordHitMap.set(t, (wordHitMap.get(t) || 0) + 1);
        }
      }
    }
  }

  // Trigram matches only (slop_list_trigrams.json)
  if (slopTrigrams.size && n >= 3) {
    for (let i = 0; i < n - 2; i++) {
      const tg = tokens[i] + " " + tokens[i + 1] + " " + tokens[i + 2];
      if (slopTrigrams.has(tg)) {
        triHitCount++;
        if (trackHits && triHitMap) {
          triHitMap.set(tg, (triHitMap.get(tg) || 0) + 1);
        }
      }
    }
  }

  const wordScore = (wordHitCount / n) * 1000;
  const trigramScore = (triHitCount / n) * 1000;

  const result: SlopIndexResult = { wordScore, trigramScore, wordHits: null, trigramHits: null };

  if (trackHits) {
    // Convert to sorted arrays: [[phrase, count], ...]
    result.wordHits = wordHitMap
      ? Array.from(wordHitMap.entries()).sort((a, b) => b[1] - a[1])
      : [];
    result.trigramHits = triHitMap
      ? Array.from(triHitMap.entries()).sort((a, b) => b[1] - a[1])
      : [];
  }

  return result;
}

export function contentTokens(tokens: string[]): string[] {
  return tokens.filter(t => /^[a-z]+(?:'[a-z]+)?$/.test(t) && !STOPWORDS.has(t));
}

export function makeNgrams(tokens: string[], n: number): string[] {
  return getNgrams(tokens, n);
}

export function rankOveruseWithCounts(
  ngrams: string[],
  humanFreqMap: Map<string, number>,
  topK = 40
): [string, number, number][] {
  if (!ngrams.length) return [];
  const counts = countItems(ngrams);
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;

  let minHuman = Infinity;
  for (const v of humanFreqMap.values()) if (v > 0 && v < minHuman) minHuman = v;
  if (!isFinite(minHuman)) minHuman = 1e-12;

  const rows: [string, number, number][] = [];
  for (const [ng, cnt] of counts.entries()) {
    const model_f = cnt / total;
    const human_f = humanFreqMap.get(ng) ?? minHuman;
    const ratio = model_f / (human_f + 1e-12);
    rows.push([ng, ratio, cnt]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  return rows.slice(0, topK);
}

export function computeMATTR(tokens: string[], windowSize = 500): number {
  const totalWords = tokens.length;

  if (totalWords === 0) {
    return 0;
  }

  const uniqueWords = new Set(tokens);
  const simpleTTR = uniqueWords.size / totalWords;

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

    return sumTTR / windowCount;
  }

  return simpleTTR;
}

export interface LexicalDiversity {
  mattr_500: number;
  type_token_ratio: number;
  unique_words: number;
  total_words: number;
}

export function computeLexicalDiversity(tokens: string[]): LexicalDiversity {
  const totalWords = tokens.length;

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
  const mattr = computeMATTR(tokens, 500);

  return {
    mattr_500: mattr,
    type_token_ratio: simpleTTR,
    unique_words: uniqueWords.size,
    total_words: totalWords
  };
}

// Calculate Flesch-Kincaid grade level
export function computeVocabLevel(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.match(/\b\w+\b/g) || [];

  if (sentences.length === 0 || words.length === 0) return 0;

  function countSyllables(word: string): number {
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

export function computeAverageSentenceLength(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.match(/\b\w+\b/g) || [];

  if (sentences.length === 0) return 0;
  return words.length / sentences.length;
}

export function computeAverageParagraphLength(text: string): number {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const words = text.match(/\b\w+\b/g) || [];

  if (paragraphs.length === 0) return 0;
  return words.length / paragraphs.length;
}

export function computeDialogueFrequency(text: string): number {
  const quotes = (text.match(/[""\u201C\u201D]/g) || []).length;
  const chars = text.length;

  if (chars === 0) return 0;
  return (quotes / 2 / chars) * 1000;
}

// Normalization ranges computed from leaderboard_results.json
// These ranges have a 10% buffer added to min/max values
const NORMALIZATION_RANGES = {
  slop_words: { min: 2.1214882577844882, max: 43.924784489934034 },
  slop_trigrams: { min: -0.027052241145113065, max: 1.2293612202273094 },
  contrast: { min: -0.0323480255696472, max: 0.8881555162544392 }
};

// Normalize a value to 0-1 range based on the range object
function normalizeValue(value: number, range: { min: number; max: number }): number {
  const normalized = (value - range.min) / (range.max - range.min);
  return Math.max(0, Math.min(1, normalized));
}

// Compute final slop score from components (matching slop-score.html formula)
// Uses weighted combination: 60% slop words + 25% contrast + 15% slop trigrams
export function computeSlopScore(wordScore: number, trigramScore: number, contrastRate: number): number {
  const normWords = normalizeValue(wordScore, NORMALIZATION_RANGES.slop_words);
  const normTrigrams = normalizeValue(trigramScore, NORMALIZATION_RANGES.slop_trigrams);
  const normContrast = normalizeValue(contrastRate, NORMALIZATION_RANGES.contrast);

  return (normWords * 0.6 + normContrast * 0.25 + normTrigrams * 0.15) * 100;
}

export interface AnalyzeOptions {
  file: string;
  includeWordHits?: boolean;
  includeTrigramHits?: boolean;
  includeOverRepresented?: boolean;
  includeContrastMatches?: boolean;
}

export interface AnalyzeResult {
  file: string;
  total_chars: number;
  total_words: number;
  slop_score: number;
  metrics: {
    slop_words_per_1k: number;
    slop_trigrams_per_1k: number;
    ngram_repetition_score: number;
    not_x_but_y_per_1k_chars: number;
    lexical_diversity: LexicalDiversity;
    vocab_level: number;
    avg_sentence_length: number;
    avg_paragraph_length: number;
    dialogue_frequency: number;
  };
  slop_word_hits?: [string, number][];
  slop_trigram_hits?: [string, number][];
  top_over_represented?: {
    words: { word: string; ratio: number; count: number }[];
    bigrams: { phrase: string; ratio: number; count: number }[];
    trigrams: { phrase: string; ratio: number; count: number }[];
  };
  contrast_matches?: ContrastMatch[];
}

export function analyzeText(text: string, options: AnalyzeOptions): AnalyzeResult {
  const chars = text.length;

  // Tokenize
  const toks0 = wordsOnlyLower(text);
  const toks = alphaTokens(toks0);
  const nWords = toks.length;

  if (nWords === 0) {
    return {
      file: options.file,
      total_chars: chars,
      total_words: 0,
      slop_score: 0,
      metrics: {
        slop_words_per_1k: 0,
        slop_trigrams_per_1k: 0,
        ngram_repetition_score: 0,
        not_x_but_y_per_1k_chars: 0,
        lexical_diversity: { mattr_500: 0, type_token_ratio: 0, unique_words: 0, total_words: 0 },
        vocab_level: 0,
        avg_sentence_length: 0,
        avg_paragraph_length: 0,
        dialogue_frequency: 0
      }
    };
  }

  const trackHits = options.includeWordHits || options.includeTrigramHits;

  // Slop index
  const slopResult = computeSlopIndex(toks, trackHits);

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
  const contrastMatches = extractContrastMatches(text);
  const contrastRate = chars > 0 ? (contrastMatches.length / chars) * 1000 : 0;

  // Lexical diversity
  const lexicalDiversity = computeLexicalDiversity(toks);

  // Additional writing metrics
  const vocabLevel = computeVocabLevel(text);
  const avgSentenceLength = computeAverageSentenceLength(text);
  const avgParagraphLength = computeAverageParagraphLength(text);
  const dialogueFrequency = computeDialogueFrequency(text);

  // Compute final slop score
  const slopScore = computeSlopScore(
    slopResult.wordScore,
    slopResult.trigramScore,
    contrastRate
  );

  // Build result
  const result: AnalyzeResult = {
    file: options.file,
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
    }
  };

  // Optional fields
  if (options.includeWordHits) {
    result.slop_word_hits = slopResult.wordHits || [];
  }

  if (options.includeTrigramHits) {
    result.slop_trigram_hits = slopResult.trigramHits || [];
  }

  if (options.includeContrastMatches) {
    result.contrast_matches = contrastMatches.slice(0, 100);
  }

  if (options.includeOverRepresented) {
    // Top over-represented words (vs wordfreq baseline)
    let wordCounts = countItems(toksContent);
    wordCounts = mergePossessives(wordCounts);

    const totalWords = Array.from(wordCounts.values()).reduce((a, b) => a + b, 0);
    const wordOverrep: { word: string; ratio: number; count: number }[] = [];

    for (const [w, cnt] of wordCounts.entries()) {
      const baselineFreq = lookupFrequency(w);
      if (!baselineFreq) continue;

      const modelFreq = cnt / totalWords;
      const ratio = modelFreq / baselineFreq;

      if (ratio > 1.5 && cnt >= 2) {
        wordOverrep.push({ word: w, ratio, count: cnt });
      }
    }
    wordOverrep.sort((a, b) => b.ratio - a.ratio);

    result.top_over_represented = {
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
    };
  }

  return result;
}
