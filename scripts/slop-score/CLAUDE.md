# Slop Score CLI - Project Context

You are working on creating a self-contained CLI tool for analyzing text for AI "slop" patterns.

## Project Overview

**Goal**: Create a portable CLI at `scripts/slop-score/` that analyzes text files for AI writing patterns ("slop"). Users with Bun installed run it directly without installation.

**Approach**: Bundle TypeScript source + dependencies into single `analyze.js` using `bun build`.

## Directory Structure

```
slop-score/                    # Project root
├── data/                      # Source data files (DO NOT MODIFY)
│   ├── test.txt              # Test input file
│   ├── large_en.msgpack.gz   # Wordfreq data
│   ├── human_writing_profile.json  # Human baseline (73MB)
│   ├── slop_list.json
│   ├── slop_list_bigrams.json
│   └── slop_list_trigrams.json
├── js/                        # Existing JS implementation (REFERENCE ONLY)
│   ├── metrics.js            # Core metrics - PORT THIS
│   ├── utils.js              # Utilities - PORT THIS
│   ├── wordfreq.js           # Wordfreq class - PORT THIS
│   ├── contrast-detector.js  # Pattern detection - PORT THIS
│   └── pos-tagger.js         # POS tagging - PORT THIS
├── slop-score.html           # Browser UI (reference for analysis logic)
└── scripts/slop-score/        # YOUR WORK GOES HERE
    ├── src/
    │   ├── analyze.ts        # Main CLI
    │   ├── lib/              # Library modules
    │   └── __tests__/        # Test files
    ├── data/                 # Copied/compressed data files
    ├── fixtures/             # Test fixtures
    ├── package.json
    └── build.sh
```

## Key Files to Reference

When porting code, reference these existing implementations:

| New File | Source File | Notes |
|----------|-------------|-------|
| `src/lib/utils.ts` | `js/utils.js` | Direct port, add TypeScript types |
| `src/lib/wordfreq.ts` | `js/wordfreq.js` | Modify paths for Bun |
| `src/lib/metrics.ts` | `js/metrics.js` | Core slop scoring logic |
| `src/lib/contrast-detector.ts` | `js/contrast-detector.js` | Pattern matching |
| `src/lib/pos-tagger.ts` | `js/pos-tagger.js` | POS tagging wrapper |
| `src/lib/regexes-stage1.ts` | `js/regexes-stage1.js` | Direct port |
| `src/lib/regexes-stage2.ts` | `js/regexes-stage2.js` | Direct port |

## TDD Workflow

**Always write tests first**, then implement:

1. Create test file in `src/__tests__/`
2. Write failing tests based on expected behavior
3. Implement the module to make tests pass
4. Run `bun test` to verify

## Testing Commands

```bash
cd scripts/slop-score

# Run all tests
bun test

# Run specific test file
bun test src/__tests__/utils.test.ts

# Watch mode
bun test --watch
```

## Data File Handling

Data files are loaded from `scripts/slop-score/data/`:

```typescript
import { gunzipSync } from 'bun';
import { join, dirname } from 'path';

// Get path relative to this script
const SCRIPT_DIR = dirname(import.meta.path);
const DATA_DIR = join(SCRIPT_DIR, '..', 'data');

// Load gzipped JSON
const compressed = await Bun.file(join(DATA_DIR, 'file.json.gz')).arrayBuffer();
const decompressed = gunzipSync(new Uint8Array(compressed));
const data = JSON.parse(new TextDecoder().decode(decompressed));
```

## Dependencies

The project uses these npm packages (in package.json):

```json
{
  "dependencies": {
    "@msgpack/msgpack": "^3.1.2",
    "wink-pos-tagger": "^2.2.2"
  }
}
```

## Task Completion Checklist

Before marking your task complete:

1. [ ] Code compiles without TypeScript errors
2. [ ] All tests pass (`bun test`)
3. [ ] No console.log statements left (except in CLI output)
4. [ ] Exports are correctly defined for other modules to import

## Common Patterns

### Exporting Functions

```typescript
// Named exports for library modules
export function wordsOnlyLower(text: string): string[] {
  // ...
}

export function countItems<T>(items: T[]): Map<T, number> {
  // ...
}
```

### Test Structure

```typescript
import { describe, test, expect } from 'bun:test';
import { wordsOnlyLower } from '../lib/utils';

describe('wordsOnlyLower', () => {
  test('converts to lowercase and extracts words', () => {
    expect(wordsOnlyLower("Hello World!")).toEqual(["hello", "world"]);
  });
});
```

### Loading Data Files

```typescript
// In metrics.ts or similar
let slopWords: Set<string>;
let slopBigrams: Set<string>;
let slopTrigrams: Set<string>;

export async function loadSlopSets(dataDir: string): Promise<void> {
  const [words, bigrams, trigrams] = await Promise.all([
    Bun.file(join(dataDir, 'slop_list.json')).json(),
    Bun.file(join(dataDir, 'slop_list_bigrams.json')).json(),
    Bun.file(join(dataDir, 'slop_list_trigrams.json')).json(),
  ]);
  slopWords = new Set(words);
  slopBigrams = new Set(bigrams);
  slopTrigrams = new Set(trigrams);
}
```

## Important Notes

1. **Don't modify files in `js/`** - These are reference only
2. **Don't modify files in `data/`** - Source data files
3. **All new code goes in `scripts/slop-score/`**
4. **Use Bun APIs** - `Bun.file()`, `Bun.write()`, `gunzipSync()` etc.
5. **Match existing output** - Results must match reference fixture exactly

## Getting Help

If blocked, check:
1. The corresponding `js/` file for implementation details
2. `slop-score.html` for how analysis is orchestrated
3. Existing test fixtures for expected values
