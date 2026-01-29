import { describe, test, expect, beforeAll } from 'bun:test';
import { join, dirname } from 'path';
import { $ } from 'bun';

const CLI_PATH = join(dirname(import.meta.path), '../analyze.ts');
const DATA_DIR = join(dirname(import.meta.path), '../../data');
const TEST_FILE = join(DATA_DIR, '../../../data/test.txt');

describe('CLI', () => {
  test('outputs valid JSON for input file', async () => {
    const result = await $`bun ${CLI_PATH} ${TEST_FILE}`.text();
    const json = JSON.parse(result);

    expect(json.file).toBeDefined();
    expect(json.slop_score).toBeDefined();
    expect(json.metrics).toBeDefined();
    expect(json.total_chars).toBeDefined();
    expect(json.total_words).toBeDefined();
  });

  test('supports --format markdown', async () => {
    const result = await $`bun ${CLI_PATH} ${TEST_FILE} --format markdown`.text();
    expect(result).toContain('# Slop Score Analysis');
    expect(result).toContain('Slop Score');
    expect(result).toContain('Metrics');
  });

  test('supports --all flag for optional fields', async () => {
    const result = await $`bun ${CLI_PATH} ${TEST_FILE} --all`.text();
    const json = JSON.parse(result);

    expect(json.slop_word_hits).toBeDefined();
    expect(json.slop_trigram_hits).toBeDefined();
    expect(json.contrast_matches).toBeDefined();
    expect(json.top_over_represented).toBeDefined();
  });

  test('supports individual flags for optional fields', async () => {
    const result = await $`bun ${CLI_PATH} ${TEST_FILE} --slop-word-hits --contrast-matches`.text();
    const json = JSON.parse(result);

    expect(json.slop_word_hits).toBeDefined();
    expect(json.contrast_matches).toBeDefined();
    // These should NOT be defined when not requested
    expect(json.slop_trigram_hits).toBeUndefined();
    expect(json.top_over_represented).toBeUndefined();
  });

  test('reads from stdin with -', async () => {
    const result = await $`echo "The cat sat on the mat. It was a nice day." | bun ${CLI_PATH} -`.text();
    const json = JSON.parse(result);

    expect(json.total_words).toBeGreaterThan(0);
    expect(json.file).toBe('-');
  });

  test('shows help with -h', async () => {
    const result = await $`bun ${CLI_PATH} -h`.text();
    expect(result).toContain('Usage:');
    expect(result).toContain('--output');
    expect(result).toContain('--format');
    expect(result).toContain('--all');
  });

  test('writes output to file with -o flag', async () => {
    const tempFile = join(dirname(import.meta.path), '../../test-output.json');
    await $`bun ${CLI_PATH} ${TEST_FILE} -o ${tempFile}`;

    const outputContent = await Bun.file(tempFile).text();
    const json = JSON.parse(outputContent);

    expect(json.file).toBeDefined();
    expect(json.slop_score).toBeDefined();

    // Cleanup
    await $`rm ${tempFile}`;
  });

  test('returns proper slop_score value', async () => {
    const result = await $`bun ${CLI_PATH} ${TEST_FILE}`.text();
    const json = JSON.parse(result);

    expect(typeof json.slop_score).toBe('number');
    expect(json.slop_score).toBeGreaterThan(0);
  });

  test('returns all metric fields', async () => {
    const result = await $`bun ${CLI_PATH} ${TEST_FILE}`.text();
    const json = JSON.parse(result);

    expect(json.metrics.slop_words_per_1k).toBeDefined();
    expect(json.metrics.slop_trigrams_per_1k).toBeDefined();
    expect(json.metrics.not_x_but_y_per_1k_chars).toBeDefined();
    expect(json.metrics.lexical_diversity).toBeDefined();
    expect(json.metrics.lexical_diversity.mattr_500).toBeDefined();
    expect(json.metrics.vocab_level).toBeDefined();
    expect(json.metrics.avg_sentence_length).toBeDefined();
    expect(json.metrics.avg_paragraph_length).toBeDefined();
    expect(json.metrics.dialogue_frequency).toBeDefined();
  });
});
