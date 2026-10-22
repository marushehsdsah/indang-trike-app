// Offensive, vulgar or irreverent words in English and Filipino, for the text
// people send each other: trip chat, pickup notes and rating comments (which
// are censored) and names (which are refused). Shared by the app and the
// server; the server's check is the one that counts.
//
// Words are matched one at a time, after undoing common disguises: letters
// swapped for look-alikes (sh1t, g@go, $hit), stretched letters (fuuuck),
// symbols or dots inside a word (f*ck, p.u.t.a), and letters spaced apart
// (f u c k). A word that is only part of a longer word ("class", "Dickens")
// is left alone unless the offensive part cannot be innocent (fucking,
// putanginamo).

// Anywhere inside a word.
const CONTAINS = [
  'fuck', 'fck', 'fuk', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'faggot', 'goddamn', 'motherf',
  'putangina', 'tangina', 'pukingina', 'kantot', 'jakol', 'pakyu', 'punyeta', 'tarantad', 'hinayupak', 'kupal',
];
// The whole word, allowing stretched letters and Filipino -ng/-g endings
// (gagong, tangang).
const WHOLE = [
  'ass', 'arse', 'dick', 'cock', 'pussy', 'whore', 'slut', 'bastard', 'damn', 'wtf', 'stfu', 'fk', 'fvck', 'shet',
  'nigga', 'retard', 'dumbass', 'jackass', 'bullshit', 'piss', 'twat', 'prick',
  'puta', 'putang', 'pota', 'gago', 'gaga', 'tanga', 'bobo', 'boba', 'ulol', 'olol', 'ulul', 'leche', 'letse',
  'pakshet', 'burat', 'puke', 'pekpek', 'tamod', 'inamo', 'pokpok', 'siraulo', 'buang', 'punyemas',
  'tarantado', 'tarantada', 'ungas', 'inutil', 'hayup',
];
const LOOKALIKES = { 0: 'o', 1: 'i', '!': 'i', '|': 'i', 3: 'e', 4: 'a', '@': 'a', $: 's', 5: 's', 7: 't', 8: 'b', '+': 't' };

// "fuuck" -> /f+u+c+k+/: each letter may be stretched.
const stretched = (word) => word.split('').map((letter) => `${letter}+`).join('');
const CONTAINS_PATTERN = new RegExp(CONTAINS.map(stretched).join('|'));
const WHOLE_PATTERN = new RegExp(`^(?:${WHOLE.map(stretched).join('|')})(?:n?g)?$`);

// A word's letters, lowercase, with look-alikes undone and everything else dropped.
function letters(word) {
  return word.toLowerCase().split('').map((char) => LOOKALIKES[char] ?? char).join('').normalize('NFD').replace(/[^a-z]/g, '');
}
const isOffensive = (word) => {
  const plain = letters(word);
  return plain.length > 0 && (CONTAINS_PATTERN.test(plain) || WHOLE_PATTERN.test(plain));
};

// The words of a text with where each starts and ends. Runs of single letters
// ("f u c k") are also tried joined, as one word.
function words(text) {
  const found = [...String(text ?? '').matchAll(/\S+/g)].map((match) => ({ start: match.index, end: match.index + match[0].length, word: match[0] }));
  const groups = [];
  for (let i = 0; i < found.length; i += 1) {
    if (letters(found[i].word).length !== 1) continue;
    let j = i;
    while (j + 1 < found.length && letters(found[j + 1].word).length === 1) j += 1;
    if (j > i) groups.push({ start: found[i].start, end: found[j].end, word: found.slice(i, j + 1).map(({ word }) => word).join('') });
    i = j;
  }
  return [...found, ...groups];
}

// The text with each offensive word shown as its first letter and asterisks
// ("f***"), and whether anything was hidden.
function censorText(text) {
  const source = String(text ?? '');
  const hidden = words(source).filter(({ word }) => isOffensive(word));
  if (!hidden.length) return { text: source, censored: false };
  const chars = source.split('');
  // Punctuation around a word ("t4nga?", "(gago)", "fuck!") stays as it was. A
  // letter, digit, @ or $ counts as part of the word; ! | + only inside it (sh!t).
  const partOfWord = (char) => /[a-z0-9@$]/i.test(char.normalize('NFD').charAt(0));
  for (const { start, end } of hidden) {
    let from = start, to = end - 1;
    while (from < to && !partOfWord(chars[from])) from += 1;
    while (to > from && !partOfWord(chars[to])) to -= 1;
    for (let i = from + 1; i <= to; i += 1) if (!/\s/.test(chars[i])) chars[i] = '*';
  }
  return { text: chars.join(''), censored: true };
}

const containsProfanity = (text) => words(text).some(({ word }) => isOffensive(word));

module.exports = { censorText, containsProfanity };
