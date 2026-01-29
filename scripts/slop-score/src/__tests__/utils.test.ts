import { describe, test, expect } from 'bun:test';
import {
  normalizeQuotes,
  normalizeText,
  wordsOnlyLower,
  alphaTokens,
  sentenceSpans,
  countItems,
  topKEntries,
  getNgrams,
} from '../lib/utils';

describe('normalizeQuotes', () => {
  test('converts curly single quotes to straight', () => {
    expect(normalizeQuotes('\u2018hello\u2019')).toBe("'hello'");
  });

  test('converts curly double quotes to straight', () => {
    expect(normalizeQuotes('\u201Chello\u201D')).toBe('"hello"');
  });

  test('handles multiple quote types', () => {
    expect(normalizeQuotes('\u2018test\u2019 \u201Cquote\u201D')).toBe("'test' \"quote\"");
  });

  test('handles backticks', () => {
    expect(normalizeQuotes('`code`')).toBe("'code'");
  });
});

describe('normalizeText', () => {
  test('converts em dashes to hyphens', () => {
    expect(normalizeText('hello\u2014world')).toBe('hello-world');
  });

  test('converts en dashes to hyphens', () => {
    expect(normalizeText('hello\u2013world')).toBe('hello-world');
  });

  test('converts curly quotes', () => {
    expect(normalizeText('\u201Chello\u201D \u2018world\u2019')).toBe('"hello" \'world\'');
  });
});

describe('wordsOnlyLower', () => {
  test('converts text to lowercase word array', () => {
    expect(wordsOnlyLower("Hello World!")).toEqual(["hello", "world"]);
  });

  test('handles punctuation', () => {
    expect(wordsOnlyLower("It's a test.")).toEqual(["it's", "a", "test"]);
  });

  test('handles empty string', () => {
    expect(wordsOnlyLower("")).toEqual([]);
  });

  test('strips leading/trailing apostrophes', () => {
    expect(wordsOnlyLower("'quoted' ''double''")).toEqual(["quoted", "double"]);
  });

  test('normalizes curly quotes before tokenizing', () => {
    expect(wordsOnlyLower("It\u2019s a \u2018test\u2019")).toEqual(["it's", "a", "test"]);
  });
});

describe('alphaTokens', () => {
  test('filters to alphabetic tokens', () => {
    expect(alphaTokens(["hello", "123", "world's"])).toEqual(["hello", "world's"]);
  });

  test('keeps contractions with apostrophes', () => {
    expect(alphaTokens(["it's", "don't", "can't"])).toEqual(["it's", "don't", "can't"]);
  });

  test('filters out pure numbers', () => {
    expect(alphaTokens(["abc", "123", "456"])).toEqual(["abc"]);
  });

  test('filters out alphanumeric mixed tokens', () => {
    expect(alphaTokens(["hello", "test123", "world"])).toEqual(["hello", "world"]);
  });
});

describe('sentenceSpans', () => {
  test('extracts sentence spans from text', () => {
    const text = "Hello world. How are you?";
    const spans = sentenceSpans(text);
    expect(spans.length).toBe(2);
    expect(text.slice(spans[0][0], spans[0][1])).toBe("Hello world.");
    expect(text.slice(spans[1][0], spans[1][1])).toBe(" How are you?");
  });

  test('handles trailing text without punctuation', () => {
    const text = "Hello. World";
    const spans = sentenceSpans(text);
    expect(spans.length).toBe(2);
    expect(text.slice(spans[1][0], spans[1][1])).toBe(" World");
  });

  test('handles exclamation marks', () => {
    const text = "Wow! Amazing!";
    const spans = sentenceSpans(text);
    expect(spans.length).toBe(2);
  });
});

describe('countItems', () => {
  test('counts occurrences', () => {
    const result = countItems(["a", "b", "a", "c", "a"]);
    expect(result.get("a")).toBe(3);
    expect(result.get("b")).toBe(1);
    expect(result.get("c")).toBe(1);
  });

  test('handles empty array', () => {
    const result = countItems([]);
    expect(result.size).toBe(0);
  });

  test('handles single item', () => {
    const result = countItems(["only"]);
    expect(result.get("only")).toBe(1);
  });
});

describe('topKEntries', () => {
  test('returns top K entries from Map', () => {
    const map = new Map([["a", 3], ["b", 1], ["c", 5], ["d", 2]]);
    const result = topKEntries(map, 2);
    expect(result).toEqual([["c", 5], ["a", 3]]);
  });

  test('returns top K entries from object', () => {
    const obj = { a: 3, b: 1, c: 5, d: 2 };
    const result = topKEntries(obj, 2);
    expect(result).toEqual([["c", 5], ["a", 3]]);
  });

  test('returns top K entries from array', () => {
    const arr: [string, number][] = [["a", 3], ["b", 1], ["c", 5]];
    const result = topKEntries(arr, 2);
    expect(result).toEqual([["c", 5], ["a", 3]]);
  });

  test('applies key transform', () => {
    const map = new Map([["hello", 3], ["world", 1]]);
    const result = topKEntries(map, 2, (k: string) => k.toUpperCase());
    expect(result).toEqual([["HELLO", 3], ["WORLD", 1]]);
  });
});

describe('getNgrams', () => {
  test('generates bigrams', () => {
    expect(getNgrams(["a", "b", "c", "d"], 2)).toEqual(["a b", "b c", "c d"]);
  });

  test('generates trigrams', () => {
    expect(getNgrams(["a", "b", "c", "d"], 3)).toEqual(["a b c", "b c d"]);
  });

  test('handles array shorter than n', () => {
    expect(getNgrams(["a", "b"], 3)).toEqual([]);
  });

  test('handles empty array', () => {
    expect(getNgrams([], 2)).toEqual([]);
  });

  test('generates 4-grams', () => {
    expect(getNgrams(["a", "b", "c", "d", "e"], 4)).toEqual(["a b c d", "b c d e"]);
  });
});
