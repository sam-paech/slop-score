import { describe, test, expect, beforeAll } from 'bun:test';
import { join, dirname } from 'path';
import {
  loadAllData,
  loadSlopSets,
  loadHumanProfile,
  computeSlopIndex,
  computeMATTR,
  computeVocabLevel,
  contentTokens,
  makeNgrams,
  analyzeText,
  lookupZipf,
  lookupFrequency,
  mergePossessives,
  rankOveruseWithCounts,
  humanBigramFreq,
  humanTrigramFreq
} from '../lib/metrics';

const DATA_DIR = join(dirname(import.meta.path), '../../data');

describe('Metrics', () => {
  beforeAll(async () => {
    await loadAllData(DATA_DIR);
  });

  describe('loadAllData', () => {
    test('loads wordfreq data', () => {
      const zipf = lookupZipf('the');
      expect(zipf).not.toBeNull();
      expect(zipf).toBeGreaterThan(5);
    });

    test('loads slop sets', async () => {
      // "delve" is a known slop word
      const result = computeSlopIndex(['delve', 'into', 'the', 'tapestry']);
      expect(result.wordScore).toBeGreaterThan(0);
    });

    test('loads human profile', () => {
      expect(humanBigramFreq.size).toBeGreaterThan(0);
      expect(humanTrigramFreq.size).toBeGreaterThan(0);
    });
  });

  describe('computeSlopIndex', () => {
    test('detects slop words', () => {
      const result = computeSlopIndex(['delve', 'into', 'the', 'tapestry']);
      expect(result.wordScore).toBeGreaterThan(0);
    });

    test('returns zero for clean text', () => {
      const result = computeSlopIndex(['the', 'cat', 'sat', 'on', 'mat']);
      expect(result.wordScore).toBe(0);
    });

    test('detects slop trigrams', () => {
      // "took deep breath" is a known slop trigram (no articles)
      const result = computeSlopIndex(['took', 'deep', 'breath']);
      expect(result.trigramScore).toBeGreaterThan(0);
    });

    test('returns wordHits when trackHits=true', () => {
      const result = computeSlopIndex(['delve', 'into', 'delve'], true);
      expect(result.wordHits).toBeDefined();
      expect(result.wordHits).not.toBeNull();
      expect(result.wordHits!.length).toBeGreaterThan(0);
      expect(result.wordHits![0][0]).toBe('delve');
      expect(result.wordHits![0][1]).toBe(2);
    });

    test('returns trigramHits when trackHits=true', () => {
      // "took deep breath" is a known slop trigram (no articles)
      const result = computeSlopIndex(['took', 'deep', 'breath', 'and', 'took', 'deep', 'breath'], true);
      expect(result.trigramHits).toBeDefined();
      expect(result.trigramHits!.length).toBeGreaterThan(0);
    });

    test('handles empty array', () => {
      const result = computeSlopIndex([]);
      expect(result.wordScore).toBe(0);
      expect(result.trigramScore).toBe(0);
    });
  });

  describe('contentTokens', () => {
    test('filters out stopwords', () => {
      const tokens = ['the', 'cat', 'sat', 'on', 'the', 'mat'];
      const content = contentTokens(tokens);
      expect(content).toContain('cat');
      expect(content).toContain('sat');
      expect(content).toContain('mat');
      expect(content).not.toContain('the');
      expect(content).not.toContain('on');
    });

    test('filters out non-alphabetic tokens', () => {
      const tokens = ['hello', '123', 'world', '!!!'];
      const content = contentTokens(tokens);
      expect(content).toContain('hello');
      expect(content).toContain('world');
      expect(content).not.toContain('123');
      expect(content).not.toContain('!!!');
    });

    test('allows contractions', () => {
      const tokens = ["it's", 'working', "don't", 'stop'];
      const content = contentTokens(tokens);
      expect(content).toContain("it's");
      expect(content).toContain('working');
      expect(content).toContain("don't");
      expect(content).toContain('stop');
    });
  });

  describe('makeNgrams', () => {
    test('generates bigrams', () => {
      const ngrams = makeNgrams(['a', 'b', 'c', 'd'], 2);
      expect(ngrams).toEqual(['a b', 'b c', 'c d']);
    });

    test('generates trigrams', () => {
      const ngrams = makeNgrams(['a', 'b', 'c', 'd'], 3);
      expect(ngrams).toEqual(['a b c', 'b c d']);
    });

    test('handles empty array', () => {
      const ngrams = makeNgrams([], 2);
      expect(ngrams).toEqual([]);
    });

    test('handles array shorter than n', () => {
      const ngrams = makeNgrams(['a'], 2);
      expect(ngrams).toEqual([]);
    });
  });

  describe('computeMATTR', () => {
    test('computes moving average TTR', () => {
      const words = 'the cat sat on the mat and the dog ran'.split(' ');
      const mattr = computeMATTR(words, 5);
      expect(mattr).toBeGreaterThan(0);
      expect(mattr).toBeLessThanOrEqual(1);
    });

    test('returns simple TTR for short texts', () => {
      const words = ['a', 'b', 'c'];
      const mattr = computeMATTR(words, 500);
      expect(mattr).toBeCloseTo(1, 5); // All unique
    });

    test('handles empty array', () => {
      const mattr = computeMATTR([], 500);
      expect(mattr).toBe(0);
    });

    test('returns lower TTR for repetitive text', () => {
      const repetitive = Array(100).fill('the');
      const diverse = Array(100).fill(null).map((_, i) => `word${i}`);
      const mattrRep = computeMATTR(repetitive, 50);
      const mattrDiv = computeMATTR(diverse, 50);
      expect(mattrDiv).toBeGreaterThan(mattrRep);
    });
  });

  describe('computeVocabLevel', () => {
    test('returns vocab level score', () => {
      // Some text to test
      const text = 'The cat sat on the mat. It was a nice day.';
      const level = computeVocabLevel(text);
      expect(level).toBeGreaterThanOrEqual(0);
    });

    test('returns 0 for empty text', () => {
      const level = computeVocabLevel('');
      expect(level).toBe(0);
    });
  });

  describe('lookupZipf and lookupFrequency', () => {
    test('lookupZipf returns value for common words', () => {
      const zipf = lookupZipf('the');
      expect(zipf).toBeGreaterThan(5);
    });

    test('lookupZipf returns null for unknown words', () => {
      const zipf = lookupZipf('xyzabc123notaword');
      expect(zipf).toBeNull();
    });

    test('lookupFrequency returns value for common words', () => {
      const freq = lookupFrequency('the');
      expect(freq).not.toBeNull();
      expect(freq).toBeGreaterThan(0);
    });

    test('lookupFrequency returns null for unknown words', () => {
      const freq = lookupFrequency('xyzabc123notaword');
      expect(freq).toBeNull();
    });
  });

  describe('mergePossessives', () => {
    test('merges possessives with base words', () => {
      const counts = new Map([
        ['cat', 2],
        ["cat's", 1],
        ['dog', 1]
      ]);
      const merged = mergePossessives(counts);
      expect(merged.get('cat')).toBe(3);
      expect(merged.has("cat's")).toBe(false);
      expect(merged.get('dog')).toBe(1);
    });

    test('preserves contractions', () => {
      const counts = new Map([
        ["it's", 2],
        ["that's", 1]
      ]);
      const merged = mergePossessives(counts);
      expect(merged.get("it's")).toBe(2);
      expect(merged.get("that's")).toBe(1);
    });
  });

  describe('rankOveruseWithCounts', () => {
    test('returns top over-represented ngrams', () => {
      const ngrams = ['a b', 'a b', 'a b', 'c d', 'c d'];
      const humanFreq = new Map([['a b', 0.001], ['c d', 0.01]]);
      const ranked = rankOveruseWithCounts(ngrams, humanFreq, 10);
      expect(ranked.length).toBeGreaterThan(0);
      // 'a b' appears 3 times with low baseline, so should be more over-represented
      expect(ranked[0][0]).toBe('a b');
    });

    test('handles empty ngrams', () => {
      const humanFreq = new Map([['a b', 0.001]]);
      const ranked = rankOveruseWithCounts([], humanFreq, 10);
      expect(ranked).toEqual([]);
    });
  });

  describe('analyzeText', () => {
    test('returns complete metrics object', () => {
      const result = analyzeText('The cat sat on the mat. It was a nice day.', {
        file: 'test.txt'
      });

      expect(result.file).toBe('test.txt');
      expect(result.total_chars).toBeGreaterThan(0);
      expect(result.total_words).toBeGreaterThan(0);
      expect(result.slop_score).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.slop_words_per_1k).toBeDefined();
      expect(result.metrics.slop_trigrams_per_1k).toBeDefined();
      expect(result.metrics.lexical_diversity).toBeDefined();
      expect(result.metrics.lexical_diversity.mattr_500).toBeDefined();
      expect(result.metrics.vocab_level).toBeDefined();
    });

    test('includes optional fields when requested', () => {
      const result = analyzeText('The cat delve into the tapestry. Took a deep breath.', {
        file: 'test.txt',
        includeWordHits: true,
        includeTrigramHits: true,
        includeContrastMatches: true,
        includeOverRepresented: true
      });

      expect(result.slop_word_hits).toBeDefined();
      expect(result.slop_trigram_hits).toBeDefined();
      expect(result.contrast_matches).toBeDefined();
      expect(result.top_over_represented).toBeDefined();
    });

    test('handles empty text gracefully', () => {
      const result = analyzeText('', { file: 'empty.txt' });
      expect(result.total_chars).toBe(0);
      expect(result.total_words).toBe(0);
      expect(result.slop_score).toBe(0);
    });

    test('computes slop score correctly', () => {
      // slop_score = wordScore + trigramScore + (contrastRate * 10)
      const textWithSlop = 'Delve into the tapestry. Not just good, but great.';
      const result = analyzeText(textWithSlop, { file: 'test.txt' });

      // Should have some slop score from words and contrast patterns
      expect(result.slop_score).toBeGreaterThan(0);
    });
  });
});
