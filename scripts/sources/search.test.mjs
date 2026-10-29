import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractUrduKeywords,
  knownUrduKeywords,
  normalizeSearch,
  searchExpression,
} from '../../apps/worker/src/search.ts';

test('common English and Roman Urdu concepts have deterministic search aliases', () => {
  assert.deepEqual(knownUrduKeywords('What do the sources teach about honesty?'), [
    'سچائی',
    'صداقت',
  ]);
  assert.deepEqual(knownUrduKeywords('Akhlaq mein sabr ki ahmiyat kya hai?'), ['صبر']);
  assert.deepEqual(knownUrduKeywords('Explain justice and humility'), ['عدل', 'انصاف', 'تواضع']);
  assert.deepEqual(knownUrduKeywords('Explain tawhid'), ['توحید']);
  assert.deepEqual(knownUrduKeywords('Unknown terminology'), []);
});

test('specific concepts outrank general topic and question words across languages', () => {
  assert.equal(searchExpression('اخلاق میں سچائی کی اہمیت کیا ہے؟'), '"سچائی"');
  assert.equal(searchExpression('What do the sources teach about honesty?'), '"honesty"');
  assert.equal(searchExpression('Akhlaq mein sabr ki ahmiyat kya hai?'), '"sabr"');
  assert.equal(searchExpression('اخلاق کیا ہے؟'), '"اخلاق"');
});
test('Urdu keyword parsing accepts script conversion without executing model output', () => {
  assert.deepEqual(extractUrduKeywords('اخلاق، صبر'), ['اخلاق', 'صبر']);
  assert.deepEqual(extractUrduKeywords("{terms: ['اخلاق', 'صبر']}"), ['اخلاق', 'صبر']);
  assert.deepEqual(extractUrduKeywords({ terms: ['صبر'] }), ['صبر']);
  assert.deepEqual(extractUrduKeywords('sabr, akhlaq, patience'), []);
  assert.deepEqual(extractUrduKeywords('صبر '.repeat(1000)), []);
});
test('normalization handles Arabic variants while FTS syntax stays inert and bounded', () => {
  assert.equal(normalizeSearch('كِتاب ي'), 'کتاب ی');
  assert.equal(searchExpression('honesty" OR * NEAR(x)'), '"honesty" OR "or" OR "near"');
  assert.equal(
    searchExpression(Array.from({ length: 30 }, (_, i) => `term${i}`).join(' ')).split(' OR ')
      .length,
    8,
  );
});

test('Iran theories retain discriminating terms across Urdu, English and Roman Urdu', () => {
  for (const question of [
    'ایران کے اندر عظیم انقلاب کے رونما ہونے کے سلسلے میں کیا راجح اور چند غیر راجح نظریات پائے جاتے ہیں؟',
    'What prevalent and less prevalent theories explain the emergence of the revolution in Iran?',
    'Iran mein inqilab ke barpa hone ke mutaliq raij aur ghair raij nazriyat kya hain?',
  ]) {
    const expression = searchExpression([...knownUrduKeywords(question), question].join(' '));
    for (const term of ['ایران', 'انقلاب', 'نظریات']) assert.ok(expression.includes(`"${term}"`));
    assert.ok(expression.split(' OR ').length <= 8);
  }
  assert.deepEqual(knownUrduKeywords('راجح ghair rajih'), []);
});
