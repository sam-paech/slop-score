// integration.test.ts - Verify CLI output matches reference fixture exactly
import { describe, test, expect, beforeAll } from 'bun:test';
import { join, dirname } from 'path';
import { $ } from 'bun';

const CLI_PATH = join(dirname(import.meta.path), '../analyze.ts');
// TEST_FILE is in root data/ folder, need to go up 4 levels from __tests__:
// __tests__ -> src -> slop-score -> scripts -> root, then down into data/
const TEST_FILE = join(dirname(import.meta.path), '../../../../data/test.txt');
const FIXTURE_PATH = join(dirname(import.meta.path), '../../fixtures/test.txt.expected.json');

describe('Integration: Match reference output', () => {
  let expected: any;
  let actual: any;

  beforeAll(async () => {
    // Load reference fixture
    expected = await Bun.file(FIXTURE_PATH).json();

    // Run CLI with --all to get all fields
    const result = await $`bun ${CLI_PATH} ${TEST_FILE} --all`.text();
    actual = JSON.parse(result);
  });

  describe('Basic counts', () => {
    test('total_chars matches', () => {
      expect(actual.total_chars).toBe(expected.total_chars);
    });

    test('total_words matches', () => {
      expect(actual.total_words).toBe(expected.total_words);
    });
  });

  describe('Slop score', () => {
    test('slop_score matches within tolerance', () => {
      expect(actual.slop_score).toBeCloseTo(expected.slop_score, 2);
    });
  });

  describe('Core metrics', () => {
    test('slop_words_per_1k matches', () => {
      expect(actual.metrics.slop_words_per_1k).toBeCloseTo(
        expected.metrics.slop_words_per_1k, 2
      );
    });

    test('slop_trigrams_per_1k matches', () => {
      expect(actual.metrics.slop_trigrams_per_1k).toBeCloseTo(
        expected.metrics.slop_trigrams_per_1k, 2
      );
    });

    test('ngram_repetition_score matches', () => {
      expect(actual.metrics.ngram_repetition_score).toBeCloseTo(
        expected.metrics.ngram_repetition_score, 1
      );
    });

    test('not_x_but_y_per_1k_chars matches', () => {
      expect(actual.metrics.not_x_but_y_per_1k_chars).toBeCloseTo(
        expected.metrics.not_x_but_y_per_1k_chars, 2
      );
    });
  });

  describe('Lexical diversity', () => {
    test('mattr_500 matches', () => {
      expect(actual.metrics.lexical_diversity.mattr_500).toBeCloseTo(
        expected.metrics.lexical_diversity.mattr_500, 4
      );
    });

    test('type_token_ratio matches', () => {
      expect(actual.metrics.lexical_diversity.type_token_ratio).toBeCloseTo(
        expected.metrics.lexical_diversity.type_token_ratio, 4
      );
    });

    test('unique_words matches', () => {
      expect(actual.metrics.lexical_diversity.unique_words).toBe(
        expected.metrics.lexical_diversity.unique_words
      );
    });

    test('total_words in lexical_diversity matches', () => {
      expect(actual.metrics.lexical_diversity.total_words).toBe(
        expected.metrics.lexical_diversity.total_words
      );
    });
  });

  describe('Writing metrics', () => {
    test('vocab_level matches', () => {
      expect(actual.metrics.vocab_level).toBeCloseTo(
        expected.metrics.vocab_level, 1
      );
    });

    test('avg_sentence_length matches', () => {
      expect(actual.metrics.avg_sentence_length).toBeCloseTo(
        expected.metrics.avg_sentence_length, 1
      );
    });

    test('avg_paragraph_length matches', () => {
      expect(actual.metrics.avg_paragraph_length).toBeCloseTo(
        expected.metrics.avg_paragraph_length, 1
      );
    });

    test('dialogue_frequency matches', () => {
      expect(actual.metrics.dialogue_frequency).toBeCloseTo(
        expected.metrics.dialogue_frequency, 3
      );
    });
  });

  describe('Slop hits', () => {
    test('slop_word_hits count matches', () => {
      const actualCount = actual.slop_word_hits?.length ?? 0;
      const expectedCount = expected.slop_word_hits?.length ?? 0;
      expect(actualCount).toBe(expectedCount);
    });

    test('slop_word_hits content matches', () => {
      // Sort both arrays by word for comparison
      const actualHits = (actual.slop_word_hits || [])
        .map(([word, count]: [string, number]) => ({ word, count }))
        .sort((a: any, b: any) => a.word.localeCompare(b.word));
      const expectedHits = (expected.slop_word_hits || [])
        .map(([word, count]: [string, number]) => ({ word, count }))
        .sort((a: any, b: any) => a.word.localeCompare(b.word));

      expect(actualHits).toEqual(expectedHits);
    });

    test('slop_trigram_hits count matches', () => {
      const actualCount = actual.slop_trigram_hits?.length ?? 0;
      const expectedCount = expected.slop_trigram_hits?.length ?? 0;
      expect(actualCount).toBe(expectedCount);
    });
  });

  describe('Contrast matches', () => {
    test('contrast_matches count matches', () => {
      const actualCount = actual.contrast_matches?.length ?? 0;
      const expectedCount = expected.contrast_matches?.length ?? 0;
      expect(actualCount).toBe(expectedCount);
    });

    test('contrast_matches patterns match', () => {
      const actualPatterns = (actual.contrast_matches || [])
        .map((m: any) => m.pattern_name)
        .sort();
      const expectedPatterns = (expected.contrast_matches || [])
        .map((m: any) => m.pattern_name)
        .sort();

      expect(actualPatterns).toEqual(expectedPatterns);
    });

    test('contrast_matches match_text matches', () => {
      const actualMatchTexts = (actual.contrast_matches || [])
        .map((m: any) => m.match_text)
        .sort();
      const expectedMatchTexts = (expected.contrast_matches || [])
        .map((m: any) => m.match_text)
        .sort();

      expect(actualMatchTexts).toEqual(expectedMatchTexts);
    });
  });

  describe('Over-represented ngrams', () => {
    test('top_over_represented words exist', () => {
      expect(actual.top_over_represented?.words).toBeDefined();
      expect(actual.top_over_represented?.words.length).toBeGreaterThan(0);
    });

    test('top_over_represented bigrams exist', () => {
      expect(actual.top_over_represented?.bigrams).toBeDefined();
      expect(actual.top_over_represented?.bigrams.length).toBeGreaterThan(0);
    });

    test('top_over_represented trigrams exist', () => {
      expect(actual.top_over_represented?.trigrams).toBeDefined();
      expect(actual.top_over_represented?.trigrams.length).toBeGreaterThan(0);
    });

    test('top words roughly match (top 10 overlap)', () => {
      const actualTopWords = (actual.top_over_represented?.words || [])
        .slice(0, 10)
        .map((w: any) => w.word);
      const expectedTopWords = (expected.top_over_represented?.words || [])
        .slice(0, 10)
        .map((w: any) => w.word);

      // At least 7 out of 10 top words should match
      const overlap = actualTopWords.filter((w: string) => expectedTopWords.includes(w)).length;
      expect(overlap).toBeGreaterThanOrEqual(7);
    });

    test('top bigrams roughly match (top 5 overlap)', () => {
      const actualTopBigrams = (actual.top_over_represented?.bigrams || [])
        .slice(0, 5)
        .map((b: any) => b.phrase);
      const expectedTopBigrams = (expected.top_over_represented?.bigrams || [])
        .slice(0, 5)
        .map((b: any) => b.phrase);

      // At least 3 out of 5 top bigrams should match
      const overlap = actualTopBigrams.filter((b: string) => expectedTopBigrams.includes(b)).length;
      expect(overlap).toBeGreaterThanOrEqual(3);
    });
  });
});
