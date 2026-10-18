import test from 'node:test';
import assert from 'node:assert/strict';
import { applyUpdate, blendTrait, publicProfile, completeness } from '../../src/profile.js';
import { emptyHidden } from '../../src/traits.js';

function user() {
  return { id: 'u1', name: 'A', basics: { gender: 'woman', seeking: 'men', age: 30, city: 'London' }, hidden: emptyHidden(), shared: { bio: '', bioDraft: '', interests: [], items: [] } };
}

test('blendTrait: first evidence moves a lot, later evidence less', () => {
  const a = blendTrait({ value: 0.5, confidence: 0 }, 1, 0.5);
  assert.equal(a.value, 1);
  const b = blendTrait(a, 0, 0.1);
  assert.ok(b.value > 0.7 && b.confidence > a.confidence);
  assert.ok(b.confidence < 1);
});

test('blendTrait ignores junk', () => {
  const t = { value: 0.4, confidence: 0.3 };
  assert.deepEqual(blendTrait(t, 'x', 0.5), t);
  assert.deepEqual(blendTrait(t, 0.9, 0), t);
});

test('applyUpdate keeps tags consistent and filters unknown ones', () => {
  const u = user();
  applyUpdate(u, { tags: ['smoker', 'made-up'] });
  applyUpdate(u, { tags: ['non-smoker'] });
  assert.deepEqual(u.hidden.tags, ['non-smoker']);
});

test('agent suggestions never go public until approved', () => {
  const u = user();
  applyUpdate(u, { sharedSuggestions: [{ prompt: 'My ideal Sunday', text: 'Long walks.' }], bio: 'Draft bio', interests: ['hiking'] });
  const pub = publicProfile(u);
  assert.equal(pub.items.length, 0);
  assert.equal(pub.bio, '');
  assert.deepEqual(pub.interests, []);
  u.shared.items[0].status = 'approved';
  assert.equal(publicProfile(u).items.length, 1);
});

test('public profile has no hidden fields', () => {
  const u = user();
  applyUpdate(u, { privateNote: 'secret', dealbreakers: ['smoker'] });
  const json = JSON.stringify(publicProfile(u));
  assert.ok(!json.includes('secret') && !json.includes('smoker') && !json.includes('traits') && !json.includes('email'));
});

test('completeness grows with answers', () => {
  const u = user();
  const before = completeness(u);
  applyUpdate(u, { traitUpdates: [{ trait: 'social', value: 0.8, confidence: 0.5 }] });
  assert.ok(completeness(u) > before);
});

test('contact details never reach the shared profile', async () => {
  const { hasContactInfo } = await import('../../src/profile.js');
  for (const t of ['mail me at a@b.com', 'call 07700 900123', 'see www.me.com', 'my insta is @zia_j', 'add me on WhatsApp']) {
    assert.ok(hasContactInfo(t), t);
  }
  for (const t of ['I ran 10 km in 2019', 'Coffee at 8, work by 9', 'Born in 1990, raised by the sea']) {
    assert.ok(!hasContactInfo(t), t);
  }
  const u = user();
  applyUpdate(u, { sharedSuggestions: [{ prompt: 'x', text: 'Find me on instagram @zia' }], bio: 'Text me on 07700 900123' });
  assert.equal(u.shared.items.length, 0);
  assert.equal(u.shared.bioDraft, '');
});
