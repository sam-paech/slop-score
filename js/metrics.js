// metrics.js - Core text analysis metrics

import { wordsOnlyLower, alphaTokens, countItems } from './utils.js';
import { loadWordfreqEnFromFile, loadWordfreqEnFromUrl } from './wordfreq.js';

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

const FUNCTION_WORDS = new Set([
  "i","you","he","she","it","we","they","me","him","her","us","them",
  "this","that","these","those","there","here","who","whom","whose","which",
  "what","when","where","why","how"
]);

let wordfreq = null; // WordfreqEn instance
let humanBigramFreq = new Map();
let humanTrigramFreq = new Map();
let slopWords = new Set();
let slopBigrams = new Set();
let slopTrigrams = new Set();

export function lookupZipf(word) {
  if (!wordfreq) return null;
  
  const zipf = wordfreq.zipfFrequency(word);
  return zipf > 0 ? zipf : null;
}

// Get frequency as proportion (0-1) for use as human baseline
// Does NOT preprocess - expects already normalized word
export function lookupFrequency(word) {
  if (!wordfreq) return null;
  
  const freq = wordfreq.frequency(word);
  return freq > 0 ? freq : null;
}

// Known contractions that should NOT have 's removed
const KNOWN_CONTRACTIONS_S = new Set([
  "it's", "that's", "what's", "who's", "he's", "she's",
  "there's", "here's", "where's", "when's", "why's", "how's",
  "let's"
]);

// Merge plural/possessive 's with base words (except contractions)
// This matches the Python preprocessing
export function mergePossessives(wordCounts) {
  const merged = new Map();
  
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

// Filter out words that are mostly numeric
export function filterNumericWords(wordCounts) {
  const filtered = new Map();
  
  for (const [word, count] of wordCounts.entries()) {
    const digitCount = (word.match(/\d/g) || []).length;
    if (word.length > 0 && (digitCount / word.length) > 0.2) {
      continue; // Skip mostly numeric words
    }
    filtered.set(word, count);
  }
  
  return filtered;
}

// Load wordfreq data
export async function loadWordfreq() {
  if (wordfreq) return;

  const isBrowser = typeof window !== 'undefined';
  const path = isBrowser
    ? './data/large_en.msgpack.gz'
    : './data/large_en.msgpack.gz';

  if (isBrowser) {
    wordfreq = await loadWordfreqEnFromUrl(path);
  } else {
    wordfreq = await loadWordfreqEnFromFile(path);
  }
}

export async function loadHumanProfile() {
  const res = await fetch("./data/human_writing_profile.json");
  if (!res.ok) throw new Error("human_writing_profile.json missing");
  const j = await res.json();
  const hp = j["human-authored"] || j["human"] || j;

  function norm(list, targetMap) {
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
      targetMap.set(toks.join(" "), (Number(it.frequency)||0)/total);
    }
  }

  norm(hp.top_bigrams || hp.bigrams || [], humanBigramFreq);
  norm(hp.top_trigrams || hp.trigrams || [], humanTrigramFreq);
}

export async function loadSlopSets() {
  async function loadSet(path, outSet) {
    const r = await fetch(path);
    if (!r.ok) return;
    const a = await r.json();
    if (!Array.isArray(a)) return;
    for (const item of a) {
      if (!item || !item.length) continue;
      const phrase = String(item[0]).toLowerCase().match(/[a-z]+(?:'[a-z]+)?(?:\s+[a-z]+(?:'[a-z]+)?)*/g);
      if (phrase) outSet.add(phrase[0]);
    }
  }

  await loadSet("./data/slop_list.json", slopWords);
  await loadSet("./data/slop_list_bigrams.json", slopBigrams);
  await loadSet("./data/slop_list_trigrams.json", slopTrigrams);
}

// Returns separate slop word and trigram scores (per 1k words)
// Also tracks individual hits with frequencies when trackHits=true
export function computeSlopIndex(tokens, trackHits = false) {
  const n = tokens.length || 0;
  if (!n) return { wordScore: 0, trigramScore: 0, wordHits: null, trigramHits: null };

  let wordHitCount = 0, triHitCount = 0;
  const wordHitMap = trackHits ? new Map() : null;
  const triHitMap = trackHits ? new Map() : null;

  // Single-word matches only (slop_list.json)
  if (slopWords.size) {
    for (const t of tokens) {
      if (slopWords.has(t)) {
        wordHitCount++;
        if (trackHits) {
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
        if (trackHits) {
          triHitMap.set(tg, (triHitMap.get(tg) || 0) + 1);
        }
      }
    }
  }

  const wordScore = (wordHitCount / n) * 1000;
  const trigramScore = (triHitCount / n) * 1000;

  const result = { wordScore, trigramScore };

  if (trackHits) {
    // Convert to sorted arrays: [[phrase, count], ...]
    result.wordHits = Array.from(wordHitMap.entries()).sort((a, b) => b[1] - a[1]);
    result.trigramHits = Array.from(triHitMap.entries()).sort((a, b) => b[1] - a[1]);
  }

  return result;
}

export function contentTokens(tokens) {
  return tokens.filter(t => /^[a-z]+(?:'[a-z]+)?$/.test(t) && !STOPWORDS.has(t));
}

export function makeNgrams(tokens, n) {
  const out = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

export function rankOveruseWithCounts(ngrams, humanFreqMap, topK = 40) {
  if (!ngrams.length) return [];
  const counts = countItems(ngrams);
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;

  let minHuman = Infinity;
  for (const v of humanFreqMap.values()) if (v > 0 && v < minHuman) minHuman = v;
  if (!isFinite(minHuman)) minHuman = 1e-12;

  const rows = [];
  for (const [ng, cnt] of counts.entries()) {
    const model_f = cnt / total;
    const human_f = humanFreqMap.get(ng) ?? minHuman;
    const ratio = model_f / (human_f + 1e-12);
    rows.push([ng, ratio, cnt]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  return rows.slice(0, topK);
}

export function extractRepeatedPhrases(text, trigramList, maxOut = 1000) {
  if (!trigramList.length) return [];
  const phrases = new Map();
  const lx = text;

  for (const [tg] of trigramList.slice(0, 300)) {
    const rx = new RegExp(`\\b${tg.replace(/\s+/g, '\\s+')}\\b`, "gi");
    const matches = lx.match(rx);
    if (matches && matches.length) {
      const exacts = matches.map(m => m.trim());
      for (const ex of exacts) phrases.set(ex, (phrases.get(ex) || 0) + 1);
    }
  }

  const arr = Array.from(phrases.entries()).sort((a, b) => b[1] - a[1]).slice(0, maxOut);
  return arr;
}

export { humanBigramFreq, humanTrigramFreq };
