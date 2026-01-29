// utils.ts - Text normalization and tokenization utilities

/**
 * Normalize various quote characters to ASCII equivalents.
 * Single quotes: ' ' ‛ ‚ ′ ʼ ＇ ` -> '
 * Double quotes: " " „ ‟ ″ « » ＂ -> "
 */
export function normalizeQuotes(s: string): string {
  // Single quotes: ' ' ‛ ‚ ′ ʼ ＇ `
  s = s.replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC\uFF07`]/g, "'");
  // Double quotes: " " „ ‟ ″ « » ＂
  s = s.replace(/[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB\uFF02]/g, '"');
  return s;
}

/**
 * Normalize text by replacing common Unicode characters with ASCII equivalents.
 */
export function normalizeText(text: string): string {
  const replacements: Record<string, string> = {
    '\u201c': '"', '\u201d': '"',  // " "
    '\u2018': "'", '\u2019': "'",  // ' '
    '\u2014': '-', '\u2013': '-'   // — –
  };
  for (const [old, newChar] of Object.entries(replacements)) {
    text = text.replace(new RegExp(old, 'g'), newChar);
  }
  return text;
}

/**
 * Extract lowercase words from text.
 * Normalizes quotes, converts to lowercase, and extracts word tokens.
 * Strips leading/trailing apostrophes from each token.
 */
export function wordsOnlyLower(s: string): string[] {
  const txt = normalizeQuotes(s.toLowerCase());
  const toks = txt.match(/[a-z']+/g) || [];
  // Strip leading/trailing apostrophes from each token
  return toks.map(t => t.replace(/^'+|'+$/g, '')).filter(t => t.length > 0);
}

/**
 * Filter tokens to only include alphabetic words.
 * Allows contractions like "it's" and "don't".
 */
export function alphaTokens(tokens: string[]): string[] {
  return tokens.filter(t => /^[a-z]+(?:'[a-z]+)?$/.test(t));
}

/**
 * Extract sentence spans from text.
 * Returns array of [start, end] tuples for each sentence.
 */
export function sentenceSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const sentSplit = /[^.!?]*[.!?]/gs;
  let lastEnd = 0;
  let match;

  while ((match = sentSplit.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length]);
    lastEnd = match.index + match[0].length;
  }

  if (lastEnd < text.length) {
    spans.push([lastEnd, text.length]);
  }

  return spans;
}

/**
 * Count occurrences of items in an array.
 */
export function countItems<T>(arr: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of arr) {
    m.set(x, (m.get(x) || 0) + 1);
  }
  return m;
}

/**
 * Get the top K entries from a Map, Object, or Array of entries.
 * Sorted by value in descending order.
 */
export function topKEntries<K, V extends number>(
  objOrMap: Map<K, V> | Record<string, V> | [K, V][],
  k: number,
  keyTransform: (key: K) => K = x => x
): [K, V][] {
  let arr: [K, V][];

  if (Array.isArray(objOrMap)) {
    arr = objOrMap.slice() as [K, V][];
  } else if (objOrMap instanceof Map) {
    arr = Array.from(objOrMap.entries()) as [K, V][];
  } else {
    arr = Object.entries(objOrMap) as unknown as [K, V][];
  }

  arr.sort((a, b) => b[1] - a[1]);
  return arr.slice(0, k).map(([w, v]) => [keyTransform(w), v]);
}

/**
 * Generate n-grams from a list of tokens.
 */
export function getNgrams(words: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    out.push(words.slice(i, i + n).join(" "));
  }
  return out;
}
