// contrast-detector.ts - Detect "not X, but Y" contrast patterns

import { normalizeText, sentenceSpans } from './utils';
import { STAGE1_REGEXES } from './regexes-stage1';
import { STAGE2_REGEXES } from './regexes-stage2';
import { hasPosTagger, tagStreamWithOffsets } from './pos-tagger';

export interface ContrastMatch {
  sentence: string;
  pattern_name: string;
  match_text: string;
  sentence_count: number;
}

export interface ContrastResult {
  hits: number;
  chars: number;
  rate_per_1k: number;
  matches: ContrastMatch[];
}

// Binary search helpers
function bisectRight(arr: number[], val: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid] <= val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function bisectLeft(arr: number[], val: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid] < val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function coveredSentenceRange(
  spans: [number, number][],
  start: number,
  end: number
): [number, number] | null {
  if (!spans.length || start >= end) return null;

  const starts = spans.map(s => s[0]);
  const ends = spans.map(s => s[1]);

  const lo = bisectRight(ends, start);
  const hi = bisectLeft(starts, end) - 1;

  if (lo >= spans.length || hi < 0 || lo > hi) {
    return null;
  }

  return [lo, hi];
}

interface CandidateInterval {
  lo: number;
  hi: number;
  raw_start: number;
  raw_end: number;
  pattern_name: string;
  match_text: string;
}

function mergeIntervals(items: CandidateInterval[]): CandidateInterval[] {
  if (!items.length) return [];

  const itemsSorted = items.slice().sort((a, b) => {
    if (a.lo !== b.lo) return a.lo - b.lo;
    if (a.hi !== b.hi) return a.hi - b.hi;
    return a.raw_start - b.raw_start;
  });

  const merged: CandidateInterval[] = [];
  let cur = { ...itemsSorted[0] };

  for (let i = 1; i < itemsSorted.length; i++) {
    const it = itemsSorted[i];
    if (it.lo <= cur.hi) {
      cur.hi = Math.max(cur.hi, it.hi);
      cur.raw_end = Math.max(cur.raw_end, it.raw_end);
    } else {
      merged.push(cur);
      cur = { ...it };
    }
  }
  merged.push(cur);

  return merged;
}

export function extractContrastMatches(text: string): ContrastMatch[] {
  const tNorm = normalizeText(text);
  const spans = sentenceSpans(tNorm);
  const candidates: CandidateInterval[] = [];

  // Stage 1: Run surface regexes on raw text
  for (const [pname, pregex] of Object.entries(STAGE1_REGEXES)) {
    // Reset regex lastIndex to ensure fresh match
    pregex.lastIndex = 0;

    // Use matchAll if regex has 'g' flag, otherwise use single match
    const matches = pregex.global
      ? Array.from(tNorm.matchAll(pregex))
      : (() => {
          const m = tNorm.match(pregex);
          return m ? [m] : [];
        })();

    for (const match of matches) {
      const rs = match.index!;
      const re = match.index! + match[0].length;
      const rng = coveredSentenceRange(spans, rs, re);

      if (rng) {
        const [lo, hi] = rng;

        candidates.push({
          lo,
          hi,
          raw_start: rs,
          raw_end: re,
          pattern_name: `S1_${pname}`,
          match_text: match[0].trim(),
        });
      }
    }
  }

  // Stage 2: Run POS-based regexes on tagged stream
  if (hasPosTagger() && Object.keys(STAGE2_REGEXES).length > 0) {
    const { stream, pieces } = tagStreamWithOffsets(tNorm, 'verb');

    const streamStarts = pieces.map(p => p[0]);
    const streamEnds = pieces.map(p => p[1]);

    function streamToRaw(ss: number, se: number): [number, number] | null {
      const i = bisectRight(streamEnds, ss);
      const j = bisectLeft(streamStarts, se) - 1;

      if (i >= pieces.length || j < i) {
        return null;
      }

      const rawS = Math.min(...pieces.slice(i, j + 1).map(p => p[2]));
      const rawE = Math.max(...pieces.slice(i, j + 1).map(p => p[3]));
      return [rawS, rawE];
    }

    for (const [pname, pregex] of Object.entries(STAGE2_REGEXES)) {
      // Reset regex lastIndex
      pregex.lastIndex = 0;

      // Use matchAll if regex has 'g' flag, otherwise use single match
      const matches = pregex.global
        ? Array.from(stream.matchAll(pregex))
        : (() => {
            const m = stream.match(pregex);
            return m ? [m] : [];
          })();

      for (const match of matches) {
        const mapRes = streamToRaw(match.index!, match.index! + match[0].length);

        if (mapRes) {
          const [rs, re] = mapRes;
          const rng = coveredSentenceRange(spans, rs, re);

          if (rng) {
            const [lo, hi] = rng;

            candidates.push({
              lo,
              hi,
              raw_start: rs,
              raw_end: re,
              pattern_name: `S2_${pname}`,
              match_text: tNorm.substring(rs, re).trim(),
            });
          }
        }
      }
    }
  }

  // Merge overlapping intervals
  const merged = mergeIntervals(candidates);

  // Build results with full sentence spans
  const results: ContrastMatch[] = [];
  for (const it of merged) {
    const sLo = it.lo;
    const sHi = it.hi;
    const sentenceSpan = sHi - sLo + 1;

    const blockStart = spans[sLo][0];
    const blockEnd = spans[sHi][1];

    const result: ContrastMatch = {
      sentence: tNorm.substring(blockStart, blockEnd).trim(),
      pattern_name: it.pattern_name,
      match_text: it.match_text,
      sentence_count: sentenceSpan,
    };
    results.push(result);
  }

  return results;
}

export function scoreText(text: string): ContrastResult {
  const hits = extractContrastMatches(text);
  const chars = text.length;
  const rate = chars > 0 ? (hits.length * 1000.0 / chars) : 0.0;

  return {
    hits: hits.length,
    chars,
    rate_per_1k: rate,
    matches: hits,
  };
}
