import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../src/db.js';
import { newUser } from '../../src/app.js';
import { signalBoost } from '../../src/matching.js';
import { signalsOf, summarizeSignals } from '../../src/signals.js';
import { cleanLooks, noteLooks, lookLeanings, lookBoost, isPlus, LOOK_TAGS } from '../../src/looks.js';
import { makeVisionEngine, VISION_SCHEMA } from '../../src/agent/vision.js';

function person(store, photoTags = []) {
  const u = newUser(store, { name: 'P', email: `${Math.random()}@x.co`, password: null });
  u.basics = { gender: 'man', seeking: 'women', age: 33, city: 'London' };
  store.data.photoLooks ||= {};
  u.photos = photoTags.map((tags, i) => {
    const id = `${u.id}-${i}.png`;
    store.data.photoLooks[id] = { owner: u.id, tags };
    return { id };
  });
  return u;
}

test('only the fixed style words are kept, and people only when one is clearly in the photo', () => {
  assert.deepEqual(cleanLooks({ people: 1, tags: ['beard', 'beard', 'blond', 'outdoors'] }), ['beard', 'outdoors']);
  assert.deepEqual(cleanLooks({ people: 3, tags: ['beard', 'outdoors', 'candid'] }), ['outdoors', 'candid']);
  assert.deepEqual(cleanLooks(null), []);
  // Nothing sensitive is even possible to record.
  for (const word of ['skin', 'ethnic', 'weight', 'fat', 'thin', 'attractive', 'pretty', 'age', 'old', 'young']) {
    assert.ok(!LOOK_TAGS.some((t) => t.includes(word)), word);
  }
});

test('leanings need enough decisions, then show which styles they go for', () => {
  const store = new Store(null);
  const me = person(store);
  noteLooks(store, me, ['beard', 'outdoors'], true);
  noteLooks(store, me, ['beard', 'glasses'], true);
  assert.deepEqual(lookLeanings(signalsOf(store, me.id)), {}, 'two decisions are not enough');
  noteLooks(store, me, ['clean-shaven', 'city'], false);
  noteLooks(store, me, ['clean-shaven', 'outdoors'], false);
  const lean = lookLeanings(signalsOf(store, me.id));
  assert.ok(lean.beard > 0.3);
  assert.ok(lean['clean-shaven'] < -0.3);
  assert.equal(lean.outdoors, undefined, 'liked and passed alike: no leaning');
  noteLooks(store, me, [], true);
  assert.equal(signalsOf(store, me.id).looks.nLiked, 2, 'a person with no described photos is not counted');
  assert.deepEqual(summarizeSignals(signalsOf(store, me.id)).looksFromPhotos.decisions, 4);
});

test('looks only move the ranking for Plus members, and only a little', () => {
  const store = new Store(null);
  const me = person(store);
  for (let i = 0; i < 5; i++) noteLooks(store, me, ['beard', 'smart-style'], true);
  for (let i = 0; i < 5; i++) noteLooks(store, me, ['clean-shaven', 'sporty-style'], false);
  const bearded = person(store, [['beard', 'smart-style']]);
  const shaven = person(store, [['clean-shaven', 'sporty-style']]);
  const none = person(store);
  assert.equal(isPlus(me), false);
  assert.equal(lookBoost(store, me, bearded), 0);
  const before = signalBoost(store, me, bearded) - signalBoost(store, me, shaven);
  me.plan = 'plus';
  assert.ok(lookBoost(store, me, bearded) > 0);
  assert.ok(lookBoost(store, me, shaven) < 0);
  assert.equal(lookBoost(store, me, none), 0, 'no photos, no effect');
  assert.ok(Math.abs(lookBoost(store, me, bearded)) <= 0.06);
  assert.ok(signalBoost(store, me, bearded) - signalBoost(store, me, shaven) > before);
});

test('PISHI_PLUS_ALL gives everyone Plus', () => {
  process.env.PISHI_PLUS_ALL = '1';
  try {
    assert.equal(isPlus({ id: 'x' }), true);
  } finally {
    delete process.env.PISHI_PLUS_ALL;
  }
});

test('the vision engine sends the photo with a strict schema and reads the answer', async () => {
  const calls = [];
  const engine = makeVisionEngine(() => ({
    beta: { messages: { create: async (req) => {
      calls.push(req);
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ people: 1, tags: ['glasses'] }) }] };
    } } },
  }));
  const out = await engine.describe({ buf: Buffer.from('img'), mime: 'image/png' });
  assert.deepEqual(out, { people: 1, tags: ['glasses'] });
  const [req] = calls;
  assert.equal(req.output_config.format.schema, VISION_SCHEMA);
  const image = req.messages[0].content[0];
  assert.equal(image.type, 'image');
  assert.equal(image.source.media_type, 'image/png');
  assert.equal(image.source.data, Buffer.from('img').toString('base64'));
  assert.match(req.system[0].text, /Never describe or guess ethnicity/);
  const refusing = makeVisionEngine(() => ({ beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } }));
  await assert.rejects(refusing.describe({ buf: Buffer.from('x'), mime: 'image/png' }), /refusal/);
});
