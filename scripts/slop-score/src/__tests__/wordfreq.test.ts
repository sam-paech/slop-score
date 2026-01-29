import { describe, test, expect, beforeAll } from 'bun:test';
import { WordfreqEn, loadWordfreq } from '../lib/wordfreq';
import { join, dirname } from 'path';

const DATA_DIR = join(dirname(import.meta.path), '../../data');

describe('WordfreqEn', () => {
  let wf: WordfreqEn;

  beforeAll(async () => {
    wf = await loadWordfreq(DATA_DIR);
  });

  test('loads wordfreq data', () => {
    expect(wf).toBeDefined();
    expect(wf).toBeInstanceOf(WordfreqEn);
  });

  test('returns zipf frequency for common words', () => {
    const zipf = wf.zipfFrequency('the');
    expect(zipf).toBeGreaterThan(5); // "the" should have high zipf
  });

  test('returns 0 for unknown words', () => {
    const zipf = wf.zipfFrequency('xyzabc123notaword');
    expect(zipf).toBe(0);
  });

  test('returns zipf score for common words higher than rare words', () => {
    const theZipf = wf.zipfFrequency('the');
    const rareZipf = wf.zipfFrequency('antidisestablishmentarianism');
    // Even if rare word exists, "the" should be higher
    expect(theZipf).toBeGreaterThan(rareZipf);
  });

  test('handles empty string', () => {
    const zipf = wf.zipfFrequency('');
    expect(zipf).toBe(0);
  });

  test('handles null/undefined input', () => {
    // @ts-ignore - testing edge case
    expect(wf.zipfFrequency(null)).toBe(0);
    // @ts-ignore - testing edge case
    expect(wf.zipfFrequency(undefined)).toBe(0);
  });

  test('normalizes case', () => {
    const lowerZipf = wf.zipfFrequency('hello');
    const upperZipf = wf.zipfFrequency('HELLO');
    const mixedZipf = wf.zipfFrequency('HeLLo');
    expect(lowerZipf).toBe(upperZipf);
    expect(lowerZipf).toBe(mixedZipf);
  });

  test('handles curly quotes normalization', () => {
    const straightZipf = wf.zipfFrequency("it's");
    const curlyZipf = wf.zipfFrequency("it\u2019s"); // curly apostrophe
    expect(straightZipf).toBe(curlyZipf);
  });

  test('handles multi-word phrases', () => {
    const phraseZipf = wf.zipfFrequency('the cat sat');
    // For phrases, it returns minimum zipf of all tokens (conservative)
    expect(phraseZipf).toBeGreaterThan(0);
  });

  test('frequency returns proportion', () => {
    const freq = wf.frequency('the');
    expect(freq).toBeGreaterThan(0);
    expect(freq).toBeLessThanOrEqual(1);
  });

  test('frequency returns 0 for unknown words', () => {
    const freq = wf.frequency('xyznotaword123');
    expect(freq).toBe(0);
  });

  test('frequency for common words is higher than rare words', () => {
    const theFreq = wf.frequency('the');
    const catFreq = wf.frequency('cat');
    expect(theFreq).toBeGreaterThan(catFreq);
  });
});
