# Slop-Score: Writing Metrics Analyzer

A text analysis tool that detects AI-generated "slop" patterns, repetitive language, and rhetorical contrast structures in writing.

## Features

### 1. **Slop Index** (per 1,000 words)
Detects overused AI-generated phrases using weighted scoring:
- Unigrams (weight: 1)
- Bigrams (weight: 2)
- Trigrams (weight: 8)

### 2. **Repetition Score** (%)
Measures over-use of bigrams and trigrams compared to human writing baselines.
- Uses wordfreq frequency database as baseline
- Compares against human-authored text patterns
- Calculates top 40 over-represented n-grams

### 3. **Contrast Pattern Detection** (per 1,000 chars)
Detects "not X, but Y" rhetorical patterns common in AI writing:
- **Stage 1**: 10 surface-level regex patterns
- **Stage 2**: 35 POS-tagged patterns using wink-pos-tagger
- Merges overlapping matches across sentence boundaries

### 4. **Top Over-Represented Words**
Identifies words used more frequently than expected based on Zipf distribution.

### 5. **Top N-grams**
Shows bigrams and trigrams over-used compared to human writing baseline.

### 6. **Exact Repeated Phrases**
Finds verbatim repetitions based on top trigram analysis.


## Implementation Details

### Slop List Matches
First, the evaluated model generates 150 creative writing outputs and 150 essay outputs. Next, its writing is matched to a precomputed list of words and trigrams which are overused in AI text compared to human baselines.

### Not-X-But-Y Pattern Detection

The not-x-but-y detector implements a 2-stage regex pipeline:

**Stage 1: Surface Patterns**
- Runs 10 regex patterns on normalized text
- Patterns include: "not X, but Y", dash forms, cross-sentence contrasts
- Maps matches to sentence spans

**Stage 2: POS-Tagged Patterns**
- Tags text with wink-pos-tagger (maps Penn Treebank tags to simplified VERB/NOUN/ADJ/ADV)
- Runs 35 regex patterns on tagged stream
- Maintains character offset mapping between tagged stream and raw text
- Uses binary search for efficient offset lookups

### Slop Score Calculation
The Slop Score is a weighted composite metric designed to detect AI-generated text patterns:

- 60% - Slop Words: Frequency of individual words that appear unnaturally often in LLM outputs
- 25% - Not-x-but-y Patterns: Frequency of contrast patterns like "not just X, but Y" which are overused by AI
- 15% - Slop Trigrams: Frequency of 3-word phrases that appear unnaturally often in LLM outputs

## Usage

### Benchmarking Models

Use `bench-model.mjs` to generate text completions from any OpenAI-compatible API:

```bash
# Setup: Create .env file with your API credentials
cp .env.example .env
# Edit .env and set BASE_URL and API_KEY

# Basic usage (uses .env)
./bench-model.mjs --model "openai/gpt-4o"

# Or override with command-line args
./bench-model.mjs \
  --model "openai/gpt-4o" \
  --base-url "https://openrouter.ai/api/v1/chat/completions" \
  --api-key "your-key"

# Custom settings
./bench-model.mjs \
  --model "meta-llama/llama-3.1-70b-instruct" \
  --workers 16 \
  --max-tokens 4096 \
  --n-prompts 300
```

**Features:**
- Parallel generation with configurable worker count
- Resume support (skips already-generated prompts)
- Atomic file writes for safe concurrent operations
- Progress tracking and error reporting
- Saves to `results/[model-id].json` by default

**Parameters:**
- `--model` (required): Model identifier
- `--base-url`: API endpoint (default: from .env BASE_URL or OPENAI_BASE_URL)
- `--api-key`: API key (default: from .env API_KEY or OPENAI_API_KEY)
- `--workers`: Number of parallel requests (default: 8)
- `--max-tokens`: Max tokens per generation (default: 8096)
- `--n-prompts`: Number of prompts to use (default: 300)
- `--max-retries`: Max retries per request (default: 3)
- `--prompts`: Path to prompts file (default: data/prompts.json)
- `--results`: Custom output path

**Environment variables (.env file):**
- `BASE_URL`: API endpoint (e.g., `https://openrouter.ai/api/v1/chat/completions`)
- `API_KEY`: Your API key

### Generating the Leaderboard

Use `generate-leaderboard.mjs` to analyze all results and create the leaderboard:

```bash
# Generate leaderboard from all results/*.json files
./generate-leaderboard.mjs

# Force recalculation of all models
./generate-leaderboard.mjs --force

# Force recalculation of human baseline
./generate-leaderboard.mjs --force-recalc-human
```

**Features:**
- Calculates all metrics (slop index, repetition, contrast patterns, etc.)
- Caches results for faster subsequent runs
- Includes human baseline from `human_writing_samples/*.txt`
- Outputs to `data/leaderboard_results.json`

**Metrics calculated:**
- Slop list matches (word and trigram)
- N-gram repetition score
- Not-x-but-y contrast patterns
- Lexical diversity (MATTR-500)
- Flesch-Kincaid grade level
- Average sentence/paragraph length
- Dialogue frequency
- Top over-represented words, bigrams, and trigrams
