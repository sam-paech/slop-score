# Slop Score CLI

A self-contained command-line tool for analyzing text files for AI "slop" patterns.

## Background

This CLI tool is a TypeScript port of the browser-based slop-score analyzer from the parent repository. It was created to enable automated text analysis without requiring a browser environment.

### What is "Slop"?

"Slop" refers to patterns commonly found in AI-generated text:
- **Slop words**: Individual words over-represented in LLM outputs (e.g., "delve", "tapestry", "nuanced")
- **Slop trigrams**: 3-word phrases over-represented in LLM outputs (e.g., "took deep breath", "voice barely whisper")
- **Not-X-But-Y patterns**: Contrast constructions like "not just X, but Y" which AI overuses

### Slop Score Formula

The combined slop score is a weighted composite:
- 60% - Slop Words (per 1k words)
- 25% - Not-X-But-Y Patterns (per 1k chars)
- 15% - Slop Trigrams (per 1k words)

## Usage

Requires [Bun](https://bun.sh) to be installed.

```bash
# Basic usage
bun scripts/slop-score/analyze.js input.md

# Output to file
bun scripts/slop-score/analyze.js input.md -o results.json

# Markdown output
bun scripts/slop-score/analyze.js input.md --format markdown

# Include all optional fields (word hits, trigram hits, contrast matches, etc.)
bun scripts/slop-score/analyze.js input.md --all

# Read from stdin
cat input.md | bun scripts/slop-score/analyze.js -
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

## Output

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

### Interpreting Results

- **slop_score < 25**: Likely human-written or well-edited AI text
- **slop_score > 25**: Likely unedited AI-generated text
- **mattr_500**: Higher = more diverse vocabulary (0.55-0.75 typical)
- **vocab_level**: Flesch-Kincaid grade level

## Development

### Project Structure

```
scripts/slop-score/
├── analyze.js              # Bundled script (run with bun)
├── src/
│   ├── analyze.ts          # Main CLI entry point
│   ├── lib/                # Core modules
│   └── __tests__/          # Test files
├── data/                   # Compressed data files
├── fixtures/               # Test fixtures
├── build.sh                # Build script
└── package.json            # Dependencies
```

### Building

```bash
cd scripts/slop-score
./build.sh
```

### Testing

```bash
cd scripts/slop-score
bun test
```

### Implementation Notes

This CLI was built using TDD (Test-Driven Development):

1. **Reference output** was generated using the existing `js/` modules
2. **Tests** were written to verify output matches the reference exactly
3. **TypeScript modules** were ported from the original JavaScript
4. **Integration tests** ensure identical behavior to the browser UI

See `claude-plan.md` for the full implementation plan.

## Data Files

The analysis uses these data files (copied from the parent repo):

| File | Size | Description |
|------|------|-------------|
| `large_en.msgpack.gz` | 1.4 MB | Word frequency database (wordfreq) |
| `human_writing_profile.json.gz` | 7 MB | Human baseline ngram frequencies |
| `slop_list.json` | 24 KB | Words flagged as AI-typical |
| `slop_list_trigrams.json` | 11 KB | Trigrams flagged as AI-typical |

## License

Same license as the parent slop-score repository.
