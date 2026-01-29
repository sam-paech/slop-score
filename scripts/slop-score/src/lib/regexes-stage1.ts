// regexes-stage1.ts - Surface-level regex patterns for contrast detection

const MAXG = 160;

const PRON = "(?:it|they|this|that)";
const BE = "(?:is|are|was|were)";
const BE_NEG = "(?:is\\s+not|are\\s+not|was\\s+not|were\\s+not|isn't|aren't|wasn't|weren't|ain't)";

// 1) "not X, but Y"
export const RE_NOT_BUT = new RegExp(
  `\\b(?:(?:${BE_NEG})|not(?!\\s+(?:that|only)\\b))\\s+` +
  `(?:(?!\\bbut\\b|[.?!]).)` + `{1,100}?` +
  `[,;:]\\s*but\\s+` +
  `(?!when\\b|while\\b|which\\b|who\\b|whom\\b|whose\\b|where\\b|if\\b|that\\b|as\\b|because\\b|although\\b|though\\b|till\\b|until\\b|unless\\b|` +
  `here\\b|there\\b|then\\b|my\\b|we\\b|I\\b|you\\b|it\\s+seems\\b|it\\s+appears\\b|it\\s+felt\\b|it\\s+looks?\\b|anything\\b)`,
  'gi'
);

// 2) Dash form "… not/n't … — pron + (BE or lexical) …"
export const RE_NOT_DASH = new RegExp(
  `\\b(?:\\w+n't|not)\\s+(?:just|only|merely)?\\s+` +
  `(?:(?![.?!]).){1,${MAXG}}?` +
  `(?:-|\\s-\\s|[\\u2014\\u2013])\\s*` +
  `${PRON}\\s+(?:(?:'re|are|'s|is|were|was)\\b|(?!'re|are|'s|is|were|was)[*_~]*[a-z]\\w*)`,
  'gi'
);

// 3) Pronoun-led "It/They … not … . It/They BE …"
export const RE_PRON_BE_NOT_SEP_BE = new RegExp(
  `(?:(?<=^)|(?<=[.?!]\\s))\\s*[""']?` +
  `(?:(?:${PRON}\\s+${BE}\\s+not)|(?:${PRON}\\s+${BE}n't)|(?:it's|they're|that's)\\s+not)\\b` +
  `[^.?!]{0,${MAXG}}[.;:?!]\\s*[""']?` +
  `${PRON}\\s+(?:${BE}|(?:'s|'re))\\b(?!\\s+not\\b)`,
  'gi'
);

// 4) NP-led "… was/weren't not … . It/They BE …" with reporter-frame + "not put" guards
export const RE_NP_BE_NOT_SEP_THEY_BE = new RegExp(
  `(?:(?<=^)|(?<=[.?!]\\s))\\s*` +
  `(?![^.?!]{0,80}\\b(?:knew|know|thought|think|said|says|told|heard|learned)\\b[^.?!]{0,40}?\\bthat\\b)` +
  `(?!\\s*not\\s+without\\b)` +
  `(?![^.?!]{0,50}\\bnot\\s+put\\b)` +
  `[^.?!]{0,${MAXG}}?\\b(?:${BE_NEG})\\b[^.?!]{0,${MAXG}}[.;:?!]\\s*` +
  `[""']?${PRON}\\b(?:'re|\\s+(?:are|were|is|was))\\b(?!\\s+not\\b)`,
  'gi'
);

// 5) "no longer … ; it/they was …"
export const RE_NO_LONGER = new RegExp(
  `(?:(?<=^)|(?<=[.?!]\\s))\\s*[^.?!]{0,${MAXG}}\\bno\\s+longer\\b[^.;:?!]{0,${MAXG}}` +
  `[.;:?!]\\s*(?:it|they|this|that)\\s+(?:is|are|was|were)\\b(?!\\s+not\\b)`,
  'gi'
);

// 6) "not just … . It/They …"
export const RE_NOT_JUST_SEP = new RegExp(
  `(?:(?<=^)|(?<=[.?!]\\s))\\s*[""']?` +
  `${PRON}\\b(?:'s|'re|\\s+(?:is|are|was|were))?\\s+not\\s+just\\b[^.?!]{0,${MAXG}}[.?!]\\s*[""']?` +
  `${PRON}\\b(?:'s|'re|\\s+(?:is|are|was|were))\\b(?!\\s+not\\b)`,
  'gi'
);

// 7) Cross-sentence same-verb: "didn't V. It/They V…"
export const RE_NOT_PERIOD_SAMEVERB = new RegExp(
  `(?:(?<=^)|(?<=[.?!]\\s))[^.?!]*?\\b(?:do|does|did)n't\\b\\s+` +
  `(?:(?:\\w+\\s+){0,2})([a-z]{3,})\\b[^.?!]*[.?!]\\s*` +
  `${PRON}\\s+\\1(?:ed|es|s|ing)?\\b`,
  'gi'
);

// 8) Simple BE: "… isn't/wasn't … . It's/It is …" (+ reporter-frame guard)
export const RE_SIMPLE_BE_NOT_IT_BE = new RegExp(
  `(?:(?<=^)|(?<=[.?!]\\s))\\s*[""']?` +
  `(?!he\\b|she\\b|i\\b|you\\b|we\\b)` +
  `(?![^.?!]{0,80}\\b(?:knew|know|thought|think|said|says|told|heard|learned)\\b[^.?!]{0,40}?\\bthat\\b)` +
  `[^.?!]{0,${MAXG}}?\\b${BE_NEG}\\b[^.?!]{0,${MAXG}}[.;:?!]\\s*` +
  `[""']?it(?:'s|\\s+(?:is|are|was|were))\\b`,
  'gi'
);

// 9) Embedded "not just … ; It/They …" (allows a lead-in like "That means …")
export const RE_EMBEDDED_NOT_JUST_SEP = new RegExp(
  `(?:(?<=^)|(?<=[.?!]\\s))` +
  `[^.?!]{0,80}?\\b(?:(?:it|they)\\s+(?:is|are)|(?:it's|they're))\\s+not\\s+just\\b` +
  `[^.?!]{0,${MAXG}}[.?!]\\s*` +
  `(?:(?:it|they)\\s+(?:is|are)|(?:it's|they're))\\b`,
  'gi'
);

// 10) Dialogue-aware: "You're not just X," <said Y>. "You're Z."
export const RE_DIALOGUE_NOT_JUST = new RegExp(
  `[""']?${PRON}(?:'re|'s|\\s+(?:are|is|was|were))\\s+not\\s+just\\b[^""']{0,${MAXG}}[""']?\\s*` +
  `(?:[^.?!]{0,80}\\b(?:said|asked|whispered|muttered|replied|added|shouted|cried)\\b[^.?!]{0,80}[.?!]\\s*)?` +
  `[""']?${PRON}(?:'re|'s|\\s+(?:are|is|was|were))\\s+[*_~]?[a-z]\\w*`,
  'gi'
);

export const STAGE1_REGEXES: Record<string, RegExp> = {
  "RE_NOT_BUT": RE_NOT_BUT,
  "RE_NOT_DASH": RE_NOT_DASH,
  "RE_PRON_BE_NOT_SEP_BE": RE_PRON_BE_NOT_SEP_BE,
  "RE_NP_BE_NOT_SEP_THEY_BE": RE_NP_BE_NOT_SEP_THEY_BE,
  "RE_NO_LONGER": RE_NO_LONGER,
  "RE_NOT_JUST_SEP": RE_NOT_JUST_SEP,
  "RE_NOT_PERIOD_SAMEVERB": RE_NOT_PERIOD_SAMEVERB,
  "RE_SIMPLE_BE_NOT_IT_BE": RE_SIMPLE_BE_NOT_IT_BE,
  "RE_EMBEDDED_NOT_JUST_SEP": RE_EMBEDDED_NOT_JUST_SEP,
  "RE_DIALOGUE_NOT_JUST": RE_DIALOGUE_NOT_JUST,
};
