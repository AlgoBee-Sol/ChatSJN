// Normalize only the search copy. Citations always retain the original source text.
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const stopWords = new Set(
  'what how why is are the a an of in to for and explain about does do can according source sources teach teaching importance important meaning hai hain kya kyun kaise mein ki ka ke ko se aur ahmiyat hai hai ہے ہیں کیا کیوں کیسے میں کے کی کا کو سے اور پر یہ وہ ایک کس کریں بتائیں اہمیت مطلب مطابق بارے روشنی بیان'.split(
    ' ',
  ),
);
export function searchExpression(text: string): string {
  const words = [...new Set(normalizeSearch(text).split(' '))].filter(
    (word) => word.length > 1 && !stopWords.has(word),
  );
  // Topic labels already constrain SQL eligibility. When a specific concept is present,
  // avoid letting broad words like "ethics" displace passages about that concept.
  const topicLabels = new Set([
    'اخلاق',
    'اخلاقی',
    'akhlaq',
    'ethics',
    'ethical',
    'اسلام',
    'اسلامی',
    'islam',
    'islamic',
  ]);
  const focused = words.filter((word) => !topicLabels.has(word));
  return (focused.length ? focused : words)
    .slice(0, 8)
    .map((word) => `"${word}"`)
    .join(' OR ');
}

// Keyword translation is untrusted search data, not an answer or executable JSON.
// Accept plain words as well as a model's incidental JSON wrapper; never evaluate it.
export function extractUrduKeywords(response: unknown): string[] {
  const value = typeof response === 'string' ? response : JSON.stringify(response);
  if (!value || value.length > 1000) return [];
  return [...new Set(normalizeSearch(value).split(' '))]
    .filter((word) => word.length > 1 && /\p{Script=Arabic}/u.test(word))
    .slice(0, 6);
}

// Stable search aliases avoid generative transliteration for common domain concepts.
const vocabulary: [string[], string[]][] = [
  [['iran', 'iranian', 'irani', 'ایران'], ['ایران']],
  [['revolution', 'inqilab', 'inqlab', 'inquilab', 'انقلاب'], ['انقلاب']],
  [
    ['theories', 'theory', 'nazriyat', 'nazariat', 'nazriya', 'نظریات', 'نظریہ'],
    ['نظریات', 'نظریہ'],
  ],
  // رائج means prevalent; it is not a synonym for راجح (preferred).
  [['prevalent', 'raij', 'raaij'], ['رائج']],
  [
    ['honesty', 'truthfulness', 'sach', 'sachai', 'sachayi'],
    ['سچائی', 'صداقت'],
  ],
  [['patience', 'sabr', 'sabar'], ['صبر']],
  [['gratitude', 'shukr', 'shukar'], ['شکر']],
  [
    ['kindness', 'compassion', 'mercy', 'rahm'],
    ['رحمت', 'مہربانی'],
  ],
  [
    ['justice', 'adl', 'adal', 'insaf'],
    ['عدل', 'انصاف'],
  ],
  [['monotheism', 'tawhid', 'tauheed', 'tawheed'], ['توحید']],
  [['imamate', 'imamat'], ['امامت']],
  [
    ['belief', 'beliefs', 'aqaid'],
    ['عقائد', 'عقیدہ'],
  ],
  [['karbala'], ['کربلا']],
  [['piety', 'taqwa'], ['تقوی']],
  [['education', 'taleem', 'talim'], ['تعلیم']],
  [['knowledge', 'ilm'], ['علم']],
  [['humility', 'tawazu'], ['تواضع']],
  [['arrogance', 'takabbur'], ['تکبر']],
  [
    ['forgiveness', 'forgiving', 'maafi'],
    ['معافی', 'عفو'],
  ],
];
export function knownUrduKeywords(question: string): string[] {
  const words = new Set(normalizeSearch(question).split(' '));
  return [
    ...new Set(
      vocabulary
        .filter(([aliases]) => aliases.some((word) => words.has(word)))
        .flatMap(([, terms]) => terms),
    ),
  ].slice(0, 6);
}
