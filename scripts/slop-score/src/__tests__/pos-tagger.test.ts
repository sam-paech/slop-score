import { describe, test, expect } from 'bun:test';
import { tagText, tagWithPos, tagStreamWithOffsets, hasPosTagger, getPosTagger, VERB_TAGS, NOUN_TAGS, ADJ_TAGS, ADV_TAGS } from '../lib/pos-tagger';

describe('POS Tagger', () => {
  describe('hasPosTagger', () => {
    test('returns true when tagger is available', () => {
      expect(hasPosTagger()).toBe(true);
    });
  });

  describe('getPosTagger', () => {
    test('returns tagger instance', () => {
      const tagger = getPosTagger();
      expect(tagger).toBeDefined();
      expect(typeof tagger.tagSentence).toBe('function');
    });
  });

  describe('tagText', () => {
    test('tags simple sentence', () => {
      const result = tagText('The cat sat on the mat.');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    test('identifies nouns', () => {
      const result = tagText('The dog runs fast.');
      const hasDogAsNoun = result.some(t => t.value === 'dog' && NOUN_TAGS.has(t.pos));
      expect(hasDogAsNoun).toBe(true);
    });

    test('identifies verbs', () => {
      // Use a sentence where the tagger correctly identifies a verb
      const result = tagText('The cat runs fast.');
      const hasVerb = result.some(t => VERB_TAGS.has(t.pos));
      expect(hasVerb).toBe(true);
    });

    test('handles empty string', () => {
      const result = tagText('');
      expect(result).toEqual([]);
    });

    test('returns tokens with value and pos fields', () => {
      const result = tagText('The cat sleeps.');
      expect(result.length).toBeGreaterThan(0);
      for (const token of result) {
        expect(token).toHaveProperty('value');
        expect(token).toHaveProperty('pos');
      }
    });
  });

  describe('tagWithPos', () => {
    test('replaces verbs with VERB tag', () => {
      const result = tagWithPos('The cat runs fast.', 'verb');
      expect(result).toContain('VERB');
    });

    test('replaces nouns with NOUN tag', () => {
      const result = tagWithPos('The cat runs fast.', 'noun');
      expect(result).toContain('NOUN');
    });

    test('replaces adjectives with ADJ tag', () => {
      const result = tagWithPos('The big cat runs.', 'adj');
      expect(result).toContain('ADJ');
    });

    test('replaces adverbs with ADV tag', () => {
      const result = tagWithPos('She runs quickly.', 'adv');
      expect(result).toContain('ADV');
    });

    test('replaces all POS types when type is all', () => {
      const result = tagWithPos('The big cat runs quickly.', 'all');
      expect(result).toContain('VERB');
      expect(result).toContain('NOUN');
      expect(result).toContain('ADJ');
      expect(result).toContain('ADV');
    });

    test('handles empty text', () => {
      const result = tagWithPos('', 'verb');
      expect(result).toBe('');
    });
  });

  describe('tagStreamWithOffsets', () => {
    test('returns stream and pieces', () => {
      const result = tagStreamWithOffsets('The cat runs.', 'verb');
      expect(result).toHaveProperty('stream');
      expect(result).toHaveProperty('pieces');
      expect(typeof result.stream).toBe('string');
      expect(Array.isArray(result.pieces)).toBe(true);
    });

    test('stream contains VERB tags for verbs', () => {
      // Use a sentence where the tagger correctly identifies a verb
      const result = tagStreamWithOffsets('The cat runs fast.', 'verb');
      expect(result.stream).toContain('VERB');
    });

    test('pieces have correct offset format [streamStart, streamEnd, rawStart, rawEnd]', () => {
      const result = tagStreamWithOffsets('The cat.', 'verb');
      for (const piece of result.pieces) {
        expect(Array.isArray(piece)).toBe(true);
        expect(piece.length).toBe(4);
        expect(typeof piece[0]).toBe('number'); // streamStart
        expect(typeof piece[1]).toBe('number'); // streamEnd
        expect(typeof piece[2]).toBe('number'); // rawStart
        expect(typeof piece[3]).toBe('number'); // rawEnd
      }
    });

    test('handles empty text', () => {
      const result = tagStreamWithOffsets('', 'verb');
      expect(result.stream).toBe('');
      expect(result.pieces).toEqual([]);
    });
  });

  describe('POS tag sets', () => {
    test('VERB_TAGS contains expected tags', () => {
      expect(VERB_TAGS.has('VB')).toBe(true);
      expect(VERB_TAGS.has('VBD')).toBe(true);
      expect(VERB_TAGS.has('VBG')).toBe(true);
      expect(VERB_TAGS.has('VBN')).toBe(true);
      expect(VERB_TAGS.has('VBP')).toBe(true);
      expect(VERB_TAGS.has('VBZ')).toBe(true);
    });

    test('NOUN_TAGS contains expected tags', () => {
      expect(NOUN_TAGS.has('NN')).toBe(true);
      expect(NOUN_TAGS.has('NNS')).toBe(true);
      expect(NOUN_TAGS.has('NNP')).toBe(true);
      expect(NOUN_TAGS.has('NNPS')).toBe(true);
    });

    test('ADJ_TAGS contains expected tags', () => {
      expect(ADJ_TAGS.has('JJ')).toBe(true);
      expect(ADJ_TAGS.has('JJR')).toBe(true);
      expect(ADJ_TAGS.has('JJS')).toBe(true);
    });

    test('ADV_TAGS contains expected tags', () => {
      expect(ADV_TAGS.has('RB')).toBe(true);
      expect(ADV_TAGS.has('RBR')).toBe(true);
      expect(ADV_TAGS.has('RBS')).toBe(true);
    });
  });
});
