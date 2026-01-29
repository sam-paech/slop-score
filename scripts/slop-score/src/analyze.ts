#!/usr/bin/env bun
// analyze.ts - Main CLI entry point for slop score analysis

import { parseArgs } from 'util';
import { join, dirname } from 'path';
import { loadAllData, analyzeText, AnalyzeResult } from './lib/metrics';

// Resolve data directory relative to this script
// When bundled, the script is at scripts/slop-score/analyze.js and data is at scripts/slop-score/data/
// When running from source, the script is at scripts/slop-score/src/analyze.ts and data is at scripts/slop-score/data/
const SCRIPT_DIR = dirname(import.meta.path);
// Check if we're running from source (src/) or bundled (same level as data/)
const isSourceRun = SCRIPT_DIR.endsWith('/src') || SCRIPT_DIR.endsWith('\\src');
const DATA_DIR = isSourceRun ? join(SCRIPT_DIR, '..', 'data') : join(SCRIPT_DIR, 'data');

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    output: { type: 'string', short: 'o' },
    format: { type: 'string', short: 'f', default: 'json' },
    'slop-word-hits': { type: 'boolean' },
    'slop-trigram-hits': { type: 'boolean' },
    'top-over-represented': { type: 'boolean' },
    'contrast-matches': { type: 'boolean' },
    all: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`Usage: bun analyze.ts <input-file> [options]

Analyze text files for AI writing patterns ("slop").

Arguments:
  <input-file>              Input file to analyze (use "-" for stdin)

Options:
  -o, --output <file>       Write output to file instead of stdout
  -f, --format <type>       Output format: json or markdown (default: json)
  --slop-word-hits          Include matched slop words in output
  --slop-trigram-hits       Include matched slop trigrams in output
  --top-over-represented    Include over-represented words/ngrams vs human baseline
  --contrast-matches        Include "not X, but Y" contrast pattern matches
  --all                     Include all optional fields
  -h, --help                Show this help message

Examples:
  bun analyze.ts input.md
  bun analyze.ts input.md --all
  bun analyze.ts input.md --format markdown
  bun analyze.ts input.md -o result.json
  cat input.md | bun analyze.ts -`);
  process.exit(0);
}

// Load data files
await loadAllData(DATA_DIR);

// Read input (- for stdin)
const inputPath = positionals[0];
const text = inputPath === '-'
  ? await Bun.stdin.text()
  : await Bun.file(inputPath).text();

// Analyze
const result = analyzeText(text, {
  file: inputPath,
  includeWordHits: values.all || values['slop-word-hits'],
  includeTrigramHits: values.all || values['slop-trigram-hits'],
  includeOverRepresented: values.all || values['top-over-represented'],
  includeContrastMatches: values.all || values['contrast-matches'],
});

// Format output
function formatAsMarkdown(r: AnalyzeResult): string {
  const lines: string[] = [
    '# Slop Score Analysis',
    '',
    `**File:** ${r.file}`,
    `**Slop Score:** ${r.slop_score.toFixed(2)}`,
    '',
    '## Basic Stats',
    `- Total Characters: ${r.total_chars}`,
    `- Total Words: ${r.total_words}`,
    '',
    '## Metrics',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Slop Words (per 1k) | ${r.metrics.slop_words_per_1k.toFixed(2)} |`,
    `| Slop Trigrams (per 1k) | ${r.metrics.slop_trigrams_per_1k.toFixed(2)} |`,
    `| Ngram Repetition Score | ${r.metrics.ngram_repetition_score.toFixed(2)} |`,
    `| Not-X-But-Y (per 1k chars) | ${r.metrics.not_x_but_y_per_1k_chars.toFixed(2)} |`,
    `| MATTR-500 | ${r.metrics.lexical_diversity.mattr_500.toFixed(4)} |`,
    `| Type-Token Ratio | ${r.metrics.lexical_diversity.type_token_ratio.toFixed(4)} |`,
    `| Unique Words | ${r.metrics.lexical_diversity.unique_words} |`,
    `| Vocab Level (FK Grade) | ${r.metrics.vocab_level.toFixed(1)} |`,
    `| Avg Sentence Length | ${r.metrics.avg_sentence_length.toFixed(1)} |`,
    `| Avg Paragraph Length | ${r.metrics.avg_paragraph_length.toFixed(1)} |`,
    `| Dialogue Frequency | ${r.metrics.dialogue_frequency.toFixed(4)} |`,
  ];

  // Optional: Slop word hits
  if (r.slop_word_hits && r.slop_word_hits.length > 0) {
    lines.push('', '## Slop Word Hits', '');
    lines.push('| Word | Count |');
    lines.push('|------|-------|');
    for (const [word, count] of r.slop_word_hits.slice(0, 20)) {
      lines.push(`| ${word} | ${count} |`);
    }
    if (r.slop_word_hits.length > 20) {
      lines.push(`| ... | (${r.slop_word_hits.length - 20} more) |`);
    }
  }

  // Optional: Slop trigram hits
  if (r.slop_trigram_hits && r.slop_trigram_hits.length > 0) {
    lines.push('', '## Slop Trigram Hits', '');
    lines.push('| Phrase | Count |');
    lines.push('|--------|-------|');
    for (const [phrase, count] of r.slop_trigram_hits.slice(0, 20)) {
      lines.push(`| ${phrase} | ${count} |`);
    }
  }

  // Optional: Contrast matches
  if (r.contrast_matches && r.contrast_matches.length > 0) {
    lines.push('', '## Contrast Pattern Matches', '');
    for (const match of r.contrast_matches.slice(0, 10)) {
      lines.push(`- **${match.pattern_name}**: "${match.match_text}"`);
      lines.push(`  > ${match.sentence}`);
    }
    if (r.contrast_matches.length > 10) {
      lines.push(`- ... (${r.contrast_matches.length - 10} more matches)`);
    }
  }

  // Optional: Top over-represented
  if (r.top_over_represented) {
    const { words, bigrams, trigrams } = r.top_over_represented;

    if (words.length > 0) {
      lines.push('', '## Over-represented Words', '');
      lines.push('| Word | Ratio | Count |');
      lines.push('|------|-------|-------|');
      for (const item of words.slice(0, 10)) {
        lines.push(`| ${item.word} | ${item.ratio.toFixed(1)}x | ${item.count} |`);
      }
    }

    if (bigrams.length > 0) {
      lines.push('', '## Over-represented Bigrams', '');
      lines.push('| Phrase | Ratio | Count |');
      lines.push('|--------|-------|-------|');
      for (const item of bigrams.slice(0, 10)) {
        lines.push(`| ${item.phrase} | ${item.ratio.toFixed(1)}x | ${item.count} |`);
      }
    }

    if (trigrams.length > 0) {
      lines.push('', '## Over-represented Trigrams', '');
      lines.push('| Phrase | Ratio | Count |');
      lines.push('|--------|-------|-------|');
      for (const item of trigrams.slice(0, 10)) {
        lines.push(`| ${item.phrase} | ${item.ratio.toFixed(1)}x | ${item.count} |`);
      }
    }
  }

  return lines.join('\n');
}

const output = values.format === 'markdown'
  ? formatAsMarkdown(result)
  : JSON.stringify(result, null, 2);

if (values.output) {
  await Bun.write(values.output, output);
} else {
  console.log(output);
}
