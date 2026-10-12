import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreTraits, findInterests, findTags, findDealbreakers, toSharedText } from '../../src/agent/analyze.js';

const get = (list, trait) => list.find((t) => t.trait === trait);

test('reads social energy from free text', () => {
  assert.ok(get(scoreTraits('I love parties and being around friends'), 'social').value > 0.6);
  assert.ok(get(scoreTraits('I prefer a quiet night in to recharge'), 'social').value < 0.4);
});

test('negation flips direction within a clause', () => {
  assert.ok(get(scoreTraits("I don't really like parties"), 'social').value < 0.5);
  assert.ok(get(scoreTraits('I am not spontaneous at all'), 'planning').value > 0.5);
});

test('"too X" about someone else means the opposite preference', () => {
  assert.ok(get(scoreTraits('She seemed too quiet for me'), 'social').value > 0.5);
});

test('finds interests and their aliases, skips negated ones', () => {
  const found = findInterests('Weekends are hikes, movies and cooking. I never go to the gym.');
  assert.deepEqual(new Set(found), new Set(['hiking', 'films', 'cooking']));
});

test('tags: smoking and drinking with negation', () => {
  assert.deepEqual(findTags("I don't smoke and I drink wine"), ['non-smoker', 'drinks']);
  assert.deepEqual(findTags('I smoke sometimes, but I am sober'), ['smoker', 'sober']);
});

test('dealbreakers map to the tag the other person would carry', () => {
  assert.ok(findDealbreakers('Smoking is a hard no').includes('smoker'));
  assert.ok(findDealbreakers("Someone who doesn't want kids").includes('no-kids'));
});

test('shared text is tidied and bounded', () => {
  assert.equal(toSharedText('ok'), null);
  assert.equal(toSharedText('coffee and a long walk'), 'Coffee and a long walk.');
  const long = toSharedText('word, '.repeat(80));
  assert.ok(long.length <= 222 && long.endsWith('…'));
});
