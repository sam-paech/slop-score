# Slop-Score: Writing Metrics Analyzer

A comprehensive text analysis tool that detects AI-generated "slop" patterns, repetitive language, and rhetorical contrast structures in writing.

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

## File Structure

```
slop-score/
├── slop-score.html          # Main HTML interface
├── js/
│   ├── utils.js              # Text normalization & tokenization
│   ├── metrics.js            # Core metrics (slop, repetition)
│   ├── regexes-stage1.js     # Surface-level contrast patterns
│   ├── regexes-stage2.js     # POS-based contrast patterns
│   ├── pos-tagger.js         # Wink POS tagger wrapper
│   └── contrast-detector.js  # Contrast pattern detection engine
├── data/
│   ├── human_writing_profile.json
│   ├── slop_list.json
│   ├── slop_list_bigrams.json
│   └── slop_list_trigrams.json
└── README.md
```

## Implementation Details

### Contrast Detection Algorithm

The contrast detector implements a 2-stage pipeline matching the Python reference:

**Stage 1: Surface Patterns**
- Runs 10 regex patterns on normalized text
- Patterns include: "not X, but Y", dash forms, cross-sentence contrasts
- Maps matches to sentence spans

**Stage 2: POS-Tagged Patterns**
- Tags text with wink-pos-tagger (maps Penn Treebank tags to simplified VERB/NOUN/ADJ/ADV)
- Runs 35 regex patterns on tagged stream
- Maintains character offset mapping between tagged stream and raw text
- Uses binary search for efficient offset lookups

**Sentence Merging**
- Merges overlapping matches across sentence boundaries
- Returns full sentences containing detected patterns
- Deduplicates using interval merging algorithm

### UI Features

- **Show More/Less**: All lists default to showing 10 items with expandable "Show more" buttons
- **Live Updates**: Real-time analysis on button click
- **Contrast Matches**: Displays full sentences with pattern names
- **Resource Status**: Shows loading progress and errors

## Usage

1. Open `slop-score.html` in a modern browser
2. Paste text into the textarea
3. Click "Analyze"
4. View metrics and expand sections for details

## Dependencies

- **wink-pos-tagger**: Loaded from CDN (https://cdn.jsdelivr.net/npm/wink-pos-tagger@3.0.2/+esm)
- **wordfreq word frequencies**: Loaded from local data file
- **Human writing baseline**: Local JSON file in `data/`
- **Slop lists**: Local JSON files in `data/`

## Browser Compatibility

Requires a modern browser with ES6 module support:
- Chrome 61+
- Firefox 60+
- Safari 11+
- Edge 79+

## Notes

- POS tagging is optional; Stage 2 patterns will be skipped if tagger fails to load
- All processing happens client-side
- No data is sent to external servers
- Original Python implementation can be found in the repository for reference
