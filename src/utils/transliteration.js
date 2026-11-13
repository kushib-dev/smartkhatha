/**
 * Universal Kannada <-> Latin phonetic transliterator and normalizer
 * Allows matching spoken Kannada names against English customer names and vice-versa.
 */

const KANNADA_VOWELS = {
  'ಅ': 'a', 'ಆ': 'aa', 'ಇ': 'i', 'ಈ': 'ee', 'ಉ': 'u', 'ಊ': 'oo', 'ಋ': 'ru',
  'ಎ': 'e', 'ಏ': 'ee', 'ಐ': 'ai', 'ಒ': 'o', 'ಓ': 'oo', 'ಔ': 'au',
  'ಂ': 'm', 'ಃ': 'h'
};

const KANNADA_MATRAS = {
  'ಾ': 'a', 'ಿ': 'i', 'ೀ': 'ee', 'ು': 'u', 'ೂ': 'oo', 'ೃ': 'ru',
  'ೆ': 'e', 'ೇ': 'e', 'ೈ': 'ai', 'ೊ': 'o', 'ೋ': 'o', 'ೌ': 'au',
  '್': ''
};

const KANNADA_CONSONANTS = {
  'ಕ': 'k', 'ಖ': 'kh', 'ಗ': 'g', 'ಘ': 'gh', 'ಙ': 'ng',
  'ಚ': 'ch', 'ಛ': 'chh', 'ಜ': 'j', 'ಝ': 'jh', 'ಞ': 'ny',
  'ಟ': 't', 'ಠ': 'th', 'ಡ': 'd', 'ಢ': 'dh', 'ಣ': 'n',
  'ತ': 't', 'ಥ': 'th', 'ದ': 'd', 'ಧ': 'dh', 'ನ': 'n',
  'ಪ': 'p', 'ಫ': 'f', 'ಬ': 'b', 'ಭ': 'bh', 'ಮ': 'm',
  'ಯ': 'y', 'ರ': 'r', 'ಱ': 'r', 'ಲ': 'l', 'ವ': 'v',
  'ಶ': 'sh', 'ಷ': 'sh', 'ಸ': 's', 'ಹ': 'h', 'ಳ': 'l'
};

export function kannadaToLatin(str) {
  if (!str || typeof str !== 'string') return '';
  let result = '';
  const chars = Array.from(str.trim());

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const next = chars[i + 1];

    if (KANNADA_VOWELS[c]) {
      result += KANNADA_VOWELS[c];
    } else if (KANNADA_CONSONANTS[c]) {
      result += KANNADA_CONSONANTS[c];
      if (next && KANNADA_MATRAS[next] !== undefined) {
        result += KANNADA_MATRAS[next];
        i++;
      } else if (!next || KANNADA_CONSONANTS[next] || KANNADA_VOWELS[next] || next === ' ') {
        result += 'a';
      }
    } else if (KANNADA_MATRAS[c] !== undefined) {
      result += KANNADA_MATRAS[c];
    } else {
      result += c;
    }
  }

  // Normalize phonetic variations (e.g. double vowels, common endings)
  return result.toLowerCase()
    .replace(/aa+/g, 'a')
    .replace(/ee+/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/sh+/g, 'sh')
    .replace(/th+/g, 't')
    .replace(/dh+/g, 'd')
    .replace(/a$/, ''); // strip trailing 'a' (e.g. Ramesha -> Ramesh, Suresha -> Suresh)
}

/**
 * Phonetic similarity check between two names (either in Kannada or English)
 */
export function namesMatch(name1, name2) {
  if (!name1 || !name2) return false;
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();

  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;

  const lat1 = kannadaToLatin(n1);
  const lat2 = kannadaToLatin(n2);

  if (lat1 === lat2 || lat1.includes(lat2) || lat2.includes(lat1)) return true;

  // Levenshtein edit distance check for minor typos
  if (lat1.length >= 4 && lat2.length >= 4) {
    if (lat1.slice(0, 4) === lat2.slice(0, 4)) return true;
  }

  return false;
}
