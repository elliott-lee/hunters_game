import { test } from 'node:test';
import assert from 'node:assert/strict';
import fr from '../src/locales/fr-CA.ts';
import en from '../src/locales/en.ts';
import { preferredLocale, changeLocale, t, type TranslationKey } from '../src/i18n.ts';

test('only an explicit saved English choice overrides the French default', () => {
  for (const stored of [null, '', 'fr-CA', 'fr', 'en-US', 'broken']) assert.equal(preferredLocale(stored), 'fr-CA');
  assert.equal(preferredLocale('en'), 'en');
});
test('both languages have matching translation keys and interpolation variables', () => {
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  const variables = (value: string) => [...value.matchAll(/{{(\w+)}}/g)].map(match => match[1]).sort();
  for (const key of Object.keys(fr) as TranslationKey[]) {
    assert.deepEqual(variables(fr[key]), variables(en[key]), key);
    if (key !== 'empty') { assert.ok(fr[key].trim(), key); assert.ok(en[key].trim(), key); }
  }
});
test('i18next renders French and English counts and the chosen ending', async () => {
  await changeLocale('fr-CA');
  assert.equal(t('cracks', { count: 1 }), '1 fissure. Continue de cliquer dans ce coin-là.');
  assert.match(t('cracks', { count: 3 }), /^3 fissures rapprochées/);
  assert.equal(t('strokesPlaced', { count: 1, total: 12 }), '1 trait placé sur 12.');
  assert.equal(t('strokesPlaced', { count: 2, total: 12 }), '2 traits placés sur 12.');
  assert.equal(t('endingMessage'), 'AU TRAVAIL,\nLES JEUNES !');
  await changeLocale('en');
  assert.equal(t('cracks', { count: 1 }), '1 crack. Keep clicking in this area.');
  assert.match(t('cracks', { count: 3 }), /^3 nearby cracks/);
  assert.equal(t('endingMessage'), 'GET BACK TO WORK,\nKIDS!');
  await changeLocale('fr-CA');
});
