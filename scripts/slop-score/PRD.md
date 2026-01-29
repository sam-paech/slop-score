# Product Requirements Document: Slop Score CLI

## Overview

Create a portable, self-contained CLI tool that analyzes text files for AI "slop" patterns. The tool must be runnable with just Bun installed—no npm install required.

## Goals

1. **Zero Installation**: Users run `bun scripts/slop-score/analyze.js input.md` directly
2. **Feature Parity**: Match the analysis capabilities of the existing browser-based `slop-score.html`
3. **Portable**: Single bundled JS file with embedded dependencies
4. **TDD**: All code developed with tests first

## Non-Goals

- Native executable compilation (we use Bun's JS runtime)
- New analysis features beyond existing browser implementation
- Performance optimization beyond reasonable expectations

## Technical Approach

### Architecture

```
scripts/slop-score/
├── analyze.js              # Bundled script (all deps included, ~2MB)
├── src/
│   ├── analyze.ts          # Main CLI entry point
│   ├── lib/
│   │   ├── metrics.ts      # Core slop scoring
│   │   ├── utils.ts        # Text tokenization utilities
│   │   ├── wordfreq.ts     # Word frequency lookups
│   │   ├── contrast-detector.ts  # "not X, but Y" pattern detection
│   │   ├── pos-tagger.ts   # Part-of-speech tagging
│   │   ├── regexes-stage1.ts     # Stage 1 regex patterns
│   │   └── regexes-stage2.ts     # Stage 2 regex patterns
│   └── __tests__/          # Test files
├── data/                   # Compressed data files
├── fixtures/               # Test fixtures
├── build.sh               # Build script
└── package.json           # Dev dependencies
```

### Data Files

| File | Source | Target |
|------|--------|--------|
| `large_en.msgpack.gz` | `data/large_en.msgpack.gz` | Copy as-is (1.4 MB) |
| `human_writing_profile.json` | `data/human_writing_profile.json` (73MB) | Compress to .gz (7 MB) |
| `slop_list.json` | `data/slop_list.json` | Copy as-is (24 KB) |
| `slop_list_bigrams.json` | `data/slop_list_bigrams.json` | Copy as-is (3.4 KB) |
| `slop_list_trigrams.json` | `data/slop_list_trigrams.json` | Copy as-is (11 KB) |

### Dependencies

- `@msgpack/msgpack` - For reading msgpack wordfreq data
- `wink-pos-tagger` - For part-of-speech tagging

## CLI Interface

```bash
# Basic usage
bun scripts/slop-score/analyze.js input.md

# Output to file
bun scripts/slop-score/analyze.js input.md -o results.json

# Markdown output
bun scripts/slop-score/analyze.js input.md --format markdown

# Include optional fields
bun scripts/slop-score/analyze.js input.md --slop-word-hits --contrast-matches

# Include all optional fields
bun scripts/slop-score/analyze.js input.md --all

# Read from stdin
cat input.md | bun scripts/slop-score/analyze.js -

# Development (run TypeScript directly)
bun scripts/slop-score/src/analyze.ts input.md
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Write output to file (default: stdout) |
| `-f, --format <type>` | Output format: `json` or `markdown` (default: json) |
| `--slop-word-hits` | Include matched slop words with counts |
| `--slop-trigram-hits` | Include matched slop trigrams with counts |
| `--top-over-represented` | Include over-represented words/ngrams vs baseline |
| `--contrast-matches` | Include "not X, but Y" pattern matches |
| `--all` | Include all optional fields |
| `-h, --help` | Show help |

## Output Format

### Base Output (always included)

```json
{
  "file": "input.md",
  "total_chars": 5432,
  "total_words": 892,
  "slop_score": 23.45,
  "metrics": {
    "slop_words_per_1k": 12.5,
    "slop_trigrams_per_1k": 3.2,
    "not_x_but_y_per_1k_chars": 0.85,
    "lexical_diversity": {
      "mattr_500": 0.7234,
      "type_token_ratio": 0.45,
      "unique_words": 401
    },
    "vocab_level": 8.5,
    "avg_sentence_length": 18.3,
    "avg_paragraph_length": 95.2,
    "dialogue_frequency": 2.1
  }
}
```

### Optional Fields (with flags)

```json
{
  "slop_word_hits": [["delve", 5], ["tapestry", 3]],
  "slop_trigram_hits": [["a testament to", 2]],
  "top_over_represented": {
    "words": [{"word": "delve", "ratio": 15.2, "count": 5}],
    "bigrams": [],
    "trigrams": []
  },
  "contrast_matches": [
    {"pattern_name": "S1_not_just_but", "sentence": "...", "match_text": "..."}
  ]
}
```

## Acceptance Criteria

1. **Functional**: `bun scripts/slop-score/analyze.js data/test.txt` produces valid JSON
2. **Accurate**: Output matches reference fixture generated from existing JS code
3. **Tested**: All modules have passing unit tests
4. **Documented**: README with usage examples
5. **Portable**: Works on macOS, Linux, Windows with Bun installed

## Success Metrics

- Slop scores match web UI within 0.01 for same input
- All tests pass (`bun test`)
- Bundle size under 3 MB
- Total data files under 10 MB
