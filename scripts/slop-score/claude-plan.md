# Plan: Self-Contained Slop Score CLI Script

## Goal
Create a portable CLI script at `scripts/slop-score/` that analyzes text files for AI "slop" patterns. Users with Bun installed can run it directly without any installation step.

## Approach
Use `bun build` to create a **bundled JavaScript file** with all dependencies included:
1. Compress data files (73MB JSON → 7MB gzipped)
2. Bundle all TypeScript + dependencies into single `analyse.js`
3. Users run: `bun scripts/slop-score/analyse.js input.md`

No compilation to native executable - works on any platform with Bun.

## Directory Structure
```
scripts/slop-score/
├── analyse.js              # Bundled script (all deps included, ~2MB)
├── src/
│   ├── analyse.ts          # Main CLI entry point (source)
│   ├── lib/
│   │   ├── metrics.ts      # Core metrics
│   │   ├── utils.ts        # Text utilities
│   │   ├── wordfreq.ts     # Wordfreq loader
│   │   ├── contrast-detector.ts # Contrast patterns
│   │   ├── pos-tagger.ts   # POS tagging
│   │   ├── regexes-stage1.ts # Stage 1 patterns
│   │   └── regexes-stage2.ts # Stage 2 patterns
├── data/
│   ├── large_en.msgpack.gz       # 1.4 MB (already compressed)
│   ├── human_writing_profile.json.gz  # 7 MB (compress from 73MB)
│   ├── slop_list.json            # 24 KB
│   ├── slop_list_bigrams.json    # 3.4 KB
│   └── slop_list_trigrams.json   # 11 KB
├── build.sh                # Build script (for maintainers)
└── package.json            # Dev dependencies (for building only)
```

## CLI Interface
```bash
# Basic usage
bun scripts/slop-score/analyse.js input.md

# Output to file
bun scripts/slop-score/analyse.js input.md -o results.json

# Markdown output
bun scripts/slop-score/analyse.js input.md --format markdown

# Include optional fields
bun scripts/slop-score/analyse.js input.md --slop-word-hits --contrast-matches

# Include all optional fields
bun scripts/slop-score/analyse.js input.md --all

# Read from stdin
cat input.md | bun scripts/slop-score/analyse.js -

# Development (run TypeScript source directly)
bun scripts/slop-score/src/analyse.ts input.md
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

## Output Structure

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
  "slop_word_hits": [["delve", 5], ["tapestry", 3], ...],
  "slop_trigram_hits": [["a testament to", 2], ...],
  "top_over_represented": {
    "words": [{"word": "delve", "ratio": 15.2, "count": 5}, ...],
    "bigrams": [...],
    "trigrams": [...]
  },
  "contrast_matches": [
    {"pattern_name": "S1_not_just_but", "sentence": "...", "match_text": "..."}
  ]
}
```

## TDD Approach

We'll build this using Test-Driven Development with Bun's built-in test runner.

### Test Structure
```
scripts/slop-score/
├── src/
│   ├── __tests__/
│   │   ├── utils.test.ts        # Text tokenization tests
│   │   ├── wordfreq.test.ts     # Word frequency lookup tests
│   │   ├── metrics.test.ts      # Slop scoring tests
│   │   ├── contrast.test.ts     # Pattern detection tests
│   │   └── cli.test.ts          # End-to-end CLI tests
│   └── lib/
│       └── ...
```

### Test Categories

1. **Unit tests** - Individual functions (tokenization, n-grams, frequency lookups)
2. **Integration tests** - Full analysis pipeline with known inputs
3. **CLI tests** - End-to-end tests running the actual script

### Key Test Cases

**Unit Tests (utils.ts):**
```typescript
// Tokenization
wordsOnlyLower("Hello World!") → ["hello", "world"]
alphaTokens(["hello", "world's", "123"]) → ["hello", "world's"]
countItems(["a", "b", "a"]) → Map { "a" → 2, "b" → 1 }
```

**Unit Tests (metrics.ts):**
```typescript
// Slop detection with known words from slop_list.json
computeSlopIndex(["subtly", "evolving", "scent"]) → wordScore > 0
computeSlopIndex(["the", "cat", "sat"]) → wordScore = 0

// Trigram detection
computeSlopIndex(["took", "deep", "breath", "and"]) → trigramScore > 0
```

**Unit Tests (contrast-detector.ts):**
```typescript
// Known patterns
scoreText("not just good, but great") → hits >= 1
scoreText("The cat sat on the mat.") → hits = 0
```

**Integration Tests:**
```typescript
// Full analysis of data/test.txt
// Compare against reference fixture generated by existing JS code
import expected from '../fixtures/test.txt.expected.json';

const result = analyzeText(testTxtContent);
expect(result).toEqual(expected);  // Must match EXACTLY
```

The reference fixture is generated ONCE using the existing `js/` code, then our TypeScript implementation must reproduce it exactly.

**CLI Tests:**
```typescript
// End-to-end
$ bun analyse.js data/test.txt
→ Valid JSON output with all expected fields

$ bun analyse.js data/test.txt --format markdown
→ Markdown output with headers

$ echo "test" | bun analyse.js -
→ Reads from stdin
```

### Reference Values from Leaderboard

The leaderboard shows typical ranges:
- `slop_words_per_1k`: 5-30 (lower = less AI-like)
- `slop_trigrams_per_1k`: 0.1-2.0
- `not_x_but_y_per_1k_chars`: 0.3-1.5
- `mattr_500`: 0.55-0.75 (vocabulary diversity)

### TDD Workflow

1. **Write failing test** for a function
2. **Port the JS code** to TypeScript
3. **Run test** - verify it passes
4. **Refactor** if needed
5. Repeat for each module

## Implementation Steps (TDD Order)

### Step 0: Generate reference output from existing JS code

**Problem:** There's no existing CLI to analyze a single file. The browser UI (`slop-score.html`) has full analysis logic but can't run from command line.

**Solution:** Create a temporary Node.js script using the existing `js/` modules to generate reference JSON output.

```bash
# Create reference script at project root (temporary, not committed)
# reference-analyse.mjs
```

```javascript
#!/usr/bin/env node
// reference-analyse.mjs - Generate reference output from existing JS code
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Patch fetch for local files (same as generate-leaderboard.mjs)
const originalFetch = global.fetch;
global.fetch = async function(url, ...args) {
  if (url.startsWith('./') || url.startsWith('../')) {
    const content = readFileSync(url, 'utf-8');
    return { ok: true, json: async () => JSON.parse(content), text: async () => content };
  }
  return originalFetch(url, ...args);
};

// Disable console logging from contrast detector
console.group = () => {}; console.groupEnd = () => {};

// Import metrics
import { loadWordfreq, loadHumanProfile, loadSlopSets, computeSlopIndex, ... } from './js/metrics.js';
import { wordsOnlyLower, alphaTokens, countItems } from './js/utils.js';
import { scoreText as scoreContrast } from './js/contrast-detector.js';

// Load data
await loadWordfreq();
await loadHumanProfile();
await loadSlopSets();

// Read input file
const inputFile = process.argv[2] || './data/test.txt';
const text = readFileSync(inputFile, 'utf-8');

// Run full analysis (copy logic from slop-score.html lines 1852-1975)
// ... tokenize, compute metrics, format output ...

// Output JSON
console.log(JSON.stringify(result, null, 2));
```

```bash
# Generate reference output
node reference-analyse.mjs data/test.txt > scripts/slop-score/fixtures/test.txt.expected.json

# Also generate for a known "sloppy" text and a known "clean" text
```

This reference output becomes our test fixture - our TypeScript CLI must produce **identical JSON**.

### Step 0b: Set up project structure
```bash
mkdir -p scripts/slop-score/{src/lib,src/__tests__,data,fixtures}

# Create package.json with test scripts
# Create empty source files
```

### Step 1: Copy and compress data files
```bash
mkdir -p scripts/slop-score/{src/lib,data}

# Compress human_writing_profile.json (73MB → 7MB)
gzip -c data/human_writing_profile.json > scripts/slop-score/data/human_writing_profile.json.gz

# Copy other data files
cp data/large_en.msgpack.gz scripts/slop-score/data/
cp data/slop_list*.json scripts/slop-score/data/
```

### Step 2: TDD - Build each module with tests first

For each module, follow this order:

#### 2a: utils.ts (no dependencies)
1. Write `__tests__/utils.test.ts` with tests for `wordsOnlyLower`, `alphaTokens`, `countItems`
2. Create `lib/utils.ts` - port from `js/utils.js`
3. Run `bun test` - all tests pass

#### 2b: wordfreq.ts (depends on data files)
1. Write `__tests__/wordfreq.test.ts` with tests for frequency lookup
2. Create `lib/wordfreq.ts` - port from `js/wordfreq.js`
3. Run `bun test` - all tests pass

#### 2c: regexes (no dependencies)
1. Create `lib/regexes-stage1.ts` and `lib/regexes-stage2.ts` - direct port
2. (No tests needed - these are just regex constants)

#### 2d: pos-tagger.ts (depends on wink-pos-tagger)
1. Write `__tests__/pos-tagger.test.ts` with tests for POS tagging
2. Create `lib/pos-tagger.ts` - port from `js/pos-tagger.js` (modified for Node/Bun)
3. Run `bun test` - all tests pass

#### 2e: contrast-detector.ts (depends on utils, pos-tagger, regexes)
1. Write `__tests__/contrast.test.ts` with tests for pattern detection
2. Create `lib/contrast-detector.ts` - port from `js/contrast-detector.js`
3. Run `bun test` - all tests pass

#### 2f: metrics.ts (depends on utils, wordfreq)
1. Write `__tests__/metrics.test.ts` with tests for slop scoring
2. Create `lib/metrics.ts` - port from `js/metrics.js`
3. Run `bun test` - all tests pass

Key modifications in all ports:
1. **Data paths**: Resolve paths relative to script location using `import.meta.dir`
2. **Decompression**: Use Bun's native gzip decompression for .gz files
3. **POS tagger**: Import `wink-pos-tagger` directly (bundled by bun build)

### Step 3: Create main CLI (`src/analyse.ts`)

```typescript
#!/usr/bin/env bun
import { parseArgs } from 'util';
import { join, dirname } from 'path';

// Resolve data directory relative to this script
const SCRIPT_DIR = dirname(Bun.main);
const DATA_DIR = join(SCRIPT_DIR, '..', 'data');

// Import analysis functions
import { loadAllData, analyzeText } from './lib/metrics';
import { scoreText as scoreContrast } from './lib/contrast-detector';

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
  console.log(`Usage: bun analyse.js <input-file> [options]

Options:
  -o, --output <file>       Write output to file
  -f, --format <type>       Output format: json or markdown (default: json)
  --slop-word-hits          Include matched slop words
  --slop-trigram-hits       Include matched slop trigrams
  --top-over-represented    Include over-represented words/ngrams
  --contrast-matches        Include "not X, but Y" patterns
  --all                     Include all optional fields
  -h, --help                Show this help`);
  process.exit(0);
}

// Load data files from data/ directory
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
const output = values.format === 'markdown'
  ? formatAsMarkdown(result)
  : JSON.stringify(result, null, 2);

if (values.output) {
  await Bun.write(values.output, output);
} else {
  console.log(output);
}

function formatAsMarkdown(r: typeof result): string {
  return `# Slop Score Analysis

**File:** ${r.file}
**Slop Score:** ${r.slop_score.toFixed(2)}

## Metrics
| Metric | Value |
|--------|-------|
| Slop Words (per 1k) | ${r.metrics.slop_words_per_1k.toFixed(2)} |
| Slop Trigrams (per 1k) | ${r.metrics.slop_trigrams_per_1k.toFixed(2)} |
| Not-X-But-Y (per 1k chars) | ${r.metrics.not_x_but_y_per_1k_chars.toFixed(2)} |
| MATTR-500 | ${r.metrics.lexical_diversity.mattr_500.toFixed(4)} |
| Vocab Level | ${r.metrics.vocab_level.toFixed(1)} |
| Avg Sentence Length | ${r.metrics.avg_sentence_length.toFixed(1)} |
`;
}
```

### Step 4: Create build script (`build.sh`)

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"

# Install dev dependencies
bun install

# Bundle all dependencies into single JS file
bun build ./src/analyse.ts \
  --outfile analyse.js \
  --target bun \
  --minify

echo "Built: analyse.js ($(du -h analyse.js | cut -f1))"
echo "Test: bun analyse.js ../data/test.txt"
```

### Step 5: Create package.json for dev dependencies

```json
{
  "name": "slop-score-cli",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "build": "./build.sh",
    "dev": "bun src/analyse.ts"
  },
  "dependencies": {
    "@msgpack/msgpack": "^3.1.2",
    "wink-pos-tagger": "^2.2.2"
  }
}
```

Run tests with: `cd scripts/slop-score && bun test`

### Step 6: Build and commit

```bash
cd scripts/slop-score
./build.sh
git add analyse.js data/
git commit -m "Add slop-score CLI tool"
```

## Files to Create

### Source Files
| File | Description |
|------|-------------|
| `scripts/slop-score/analyse.js` | Bundled CLI (committed, ~2MB) |
| `scripts/slop-score/build.sh` | Build script (for maintainers) |
| `scripts/slop-score/package.json` | Dev dependencies + test scripts |
| `scripts/slop-score/src/analyse.ts` | Main CLI source |
| `scripts/slop-score/src/lib/utils.ts` | Text utilities |
| `scripts/slop-score/src/lib/metrics.ts` | Core metrics + data loading |
| `scripts/slop-score/src/lib/wordfreq.ts` | Wordfreq class |
| `scripts/slop-score/src/lib/contrast-detector.ts` | Pattern detection |
| `scripts/slop-score/src/lib/pos-tagger.ts` | POS tagging |
| `scripts/slop-score/src/lib/regexes-stage1.ts` | Stage 1 patterns |
| `scripts/slop-score/src/lib/regexes-stage2.ts` | Stage 2 patterns |

### Test Files (TDD)
| File | Description |
|------|-------------|
| `scripts/slop-score/src/__tests__/utils.test.ts` | Tokenization tests |
| `scripts/slop-score/src/__tests__/wordfreq.test.ts` | Frequency lookup tests |
| `scripts/slop-score/src/__tests__/metrics.test.ts` | Slop scoring tests |
| `scripts/slop-score/src/__tests__/contrast.test.ts` | Pattern detection tests |
| `scripts/slop-score/src/__tests__/cli.test.ts` | End-to-end CLI tests |
| `scripts/slop-score/fixtures/test.txt.expected.json` | Reference output from existing JS |

### Data Files
| File | Description |
|------|-------------|
| `scripts/slop-score/data/large_en.msgpack.gz` | Wordfreq data (1.4 MB) |
| `scripts/slop-score/data/human_writing_profile.json.gz` | Human baseline (7 MB) |
| `scripts/slop-score/data/slop_list*.json` | Slop word lists (~40 KB) |

## Size Estimates

| Component | Size |
|-----------|------|
| analyse.js (bundled) | ~2 MB |
| large_en.msgpack.gz | 1.4 MB |
| human_writing_profile.json.gz | 7 MB |
| slop_list files | ~40 KB |
| **Total (committed)** | **~10 MB** |

## Verification

1. `bun scripts/slop-score/analyse.js data/test.txt` - outputs JSON metrics
2. `bun scripts/slop-score/analyse.js data/test.txt --format markdown` - outputs markdown
3. `bun scripts/slop-score/analyse.js data/test.txt --all` - includes all optional fields
4. `echo "This is a test" | bun scripts/slop-score/analyse.js -` - reads from stdin
5. Compare slop scores with web UI for same input

## Notes

- Requires Bun to be installed (works on macOS, Linux, Windows)
- No installation step - just `bun scripts/slop-score/analyse.js`
- Data files are decompressed at runtime in memory
- To rebuild after source changes: `cd scripts/slop-score && ./build.sh`
