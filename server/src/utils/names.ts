// The lowercase words of a name or search text, split on spaces and punctuation ("Anne-Marie O'Brien" -> anne, marie, o, brien).
export const nameWords = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
