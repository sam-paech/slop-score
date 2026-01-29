// pos-tagger.ts - POS tagging utilities using wink-pos-tagger

import posTagger from 'wink-pos-tagger';

// Initialize the POS tagger
const tagger = posTagger();

// Map wink-pos tags to our simplified tags
export const VERB_TAGS = new Set(['VB', 'VBD', 'VBG', 'VBN', 'VBP', 'VBZ']);
export const NOUN_TAGS = new Set(['NN', 'NNS', 'NNP', 'NNPS']);
export const ADJ_TAGS = new Set(['JJ', 'JJR', 'JJS']);
export const ADV_TAGS = new Set(['RB', 'RBR', 'RBS']);

export interface TaggedToken {
  value: string;
  tag: string;
  pos: string;
  lemma?: string;
  normal?: string;
}

/**
 * Check if POS tagger is available
 */
export function hasPosTagger(): boolean {
  return tagger !== null;
}

/**
 * Get the POS tagger instance
 */
export function getPosTagger() {
  return tagger;
}

/**
 * Tag text and return tagged tokens
 */
export function tagText(text: string): TaggedToken[] {
  if (!text.trim()) return [];
  return tagger.tagSentence(text) as TaggedToken[];
}

export type PosType = 'verb' | 'noun' | 'adj' | 'adv' | 'all';

/**
 * Tag text and replace matching POS tokens with their type label
 */
export function tagWithPos(text: string, posType: PosType = 'verb'): string {
  if (!text.trim()) return '';

  const tagged = tagger.tagSentence(text) as TaggedToken[];
  const result: string[] = [];

  for (const token of tagged) {
    let out = token.value;
    const posTag = token.pos;

    if (posTag) {
      if (posType === 'verb' && VERB_TAGS.has(posTag)) {
        out = 'VERB';
      } else if (posType === 'noun' && NOUN_TAGS.has(posTag)) {
        out = 'NOUN';
      } else if (posType === 'adj' && ADJ_TAGS.has(posTag)) {
        out = 'ADJ';
      } else if (posType === 'adv' && ADV_TAGS.has(posTag)) {
        out = 'ADV';
      } else if (posType === 'all') {
        if (VERB_TAGS.has(posTag)) out = 'VERB';
        else if (NOUN_TAGS.has(posTag)) out = 'NOUN';
        else if (ADJ_TAGS.has(posTag)) out = 'ADJ';
        else if (ADV_TAGS.has(posTag)) out = 'ADV';
      }
    }

    result.push(out);
  }

  return result.join(' ');
}

export interface TagStreamResult {
  stream: string;
  pieces: Array<[number, number, number, number]>; // [streamStart, streamEnd, rawStart, rawEnd]
}

/**
 * Tag text and return both the tagged stream and offset mappings
 * This allows mapping matches in the tagged stream back to positions in the original text
 */
export function tagStreamWithOffsets(text: string, posType: PosType = 'verb'): TagStreamResult {
  if (!text.trim()) {
    return { stream: '', pieces: [] };
  }

  const tagged = tagger.tagSentence(text) as TaggedToken[];

  const parts: string[] = [];
  const pieces: Array<[number, number, number, number]> = [];
  let streamPos = 0;
  let rawPos = 0;

  for (let i = 0; i < tagged.length; i++) {
    const token = tagged[i];
    const posTag = token.pos;
    const value = token.value;

    // Find token in original text
    const tokenStart = text.indexOf(value, rawPos);
    if (tokenStart === -1) {
      // Fallback if we can't find it
      rawPos += value.length;
      continue;
    }

    // Map token to POS tag if applicable
    let out = value;
    if (posTag) {
      if (posType === 'verb' && VERB_TAGS.has(posTag)) {
        out = 'VERB';
      } else if (posType === 'noun' && NOUN_TAGS.has(posTag)) {
        out = 'NOUN';
      } else if (posType === 'adj' && ADJ_TAGS.has(posTag)) {
        out = 'ADJ';
      } else if (posType === 'adv' && ADV_TAGS.has(posTag)) {
        out = 'ADV';
      } else if (posType === 'all') {
        if (VERB_TAGS.has(posTag)) out = 'VERB';
        else if (NOUN_TAGS.has(posTag)) out = 'NOUN';
        else if (ADJ_TAGS.has(posTag)) out = 'ADJ';
        else if (ADV_TAGS.has(posTag)) out = 'ADV';
      }
    }

    parts.push(out);
    const outLen = out.length;
    pieces.push([streamPos, streamPos + outLen, tokenStart, tokenStart + value.length]);
    streamPos += outLen;
    rawPos = tokenStart + value.length;

    // Add space between tokens (except last)
    if (i < tagged.length - 1) {
      // Check if there's whitespace in original
      const nextToken = tagged[i + 1];
      const nextPos = text.indexOf(nextToken.value, rawPos);
      if (nextPos > rawPos) {
        const whitespace = text.substring(rawPos, nextPos);
        parts.push(whitespace);
        pieces.push([streamPos, streamPos + whitespace.length, rawPos, nextPos]);
        streamPos += whitespace.length;
        rawPos = nextPos;
      } else {
        // Add single space
        parts.push(' ');
        pieces.push([streamPos, streamPos + 1, rawPos, rawPos]);
        streamPos += 1;
      }
    }
  }

  return {
    stream: parts.join(''),
    pieces: pieces
  };
}
