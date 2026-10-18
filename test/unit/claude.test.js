import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClaudeEngine, buildUserMessage, SCHEMA } from '../../src/agent/claude.js';
import { respond, newConversation, opening } from '../../src/agent/index.js';
import { emptyHidden } from '../../src/traits.js';

function user() {
  return { id: 'u1', name: 'A', basics: { gender: 'woman', seeking: 'men', age: 30, city: 'London' }, hidden: emptyHidden(), shared: { bio: '', bioDraft: '', interests: [], items: [] } };
}

function fake(payload, calls = []) {
  return () => ({
    beta: {
      messages: {
        create: async (req) => {
          calls.push(req);
          if (payload instanceof Error) throw payload;
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] };
        },
      },
    },
  });
}

const GOOD = {
  reply: 'Sounds like a lovely Sunday. Tell me about a trip you still think about.',
  traitUpdates: [{ trait: 'social', value: 0.8, confidence: 0.4 }, { trait: 'bogus', value: 1, confidence: 1 }],
  preferenceUpdates: [],
  tags: ['drinks'],
  dealbreakers: [],
  interests: ['hiking', 'cooking'],
  values: ['kindness'],
  sharedSuggestions: [{ prompt: 'My ideal Sunday', text: 'A long hike, then cooking for friends.' }, { prompt: 'x', text: 'second one is dropped' }],
  privateNote: 'Very social on weekends.',
  bio: 'Hiker and cook.',
};

test('Claude results are applied through the same profile rules', async () => {
  const calls = [];
  const engine = makeClaudeEngine(fake(GOOD, calls));
  const u = user();
  const convo = newConversation();
  opening(u, convo);
  const msg = await respond(u, convo, 'Hiking then cooking for my friends.', engine);
  assert.equal(msg.text.startsWith('Sounds like a lovely Sunday'), true);
  assert.ok(u.hidden.traits.social.value > 0.6);
  assert.equal(u.hidden.traits.bogus, undefined);
  assert.deepEqual(u.shared.suggestedInterests, ['hiking', 'cooking']);
  assert.deepEqual(u.shared.interests, []);
  assert.equal(u.shared.items.length, 1);
  assert.equal(u.shared.items[0].status, 'suggested');
  assert.equal(u.shared.bioDraft, 'Hiker and cook.');
  assert.equal(calls[0].model, 'claude-opus-5-5');
  assert.equal(calls[0].output_config.format.type, 'json_schema');
});

test('broken or failing Claude responses fall back to the offline interviewer', async () => {
  for (const bad of ['not json', new Error('network down'), { ...GOOD, reply: '' }]) {
    const u = user();
    const convo = newConversation();
    opening(u, convo);
    const msg = await respond(u, convo, 'I love parties and going out with friends.', makeClaudeEngine(fake(bad)));
    assert.ok(msg.text.length > 10);
    assert.ok(u.hidden.traits.social.value > 0.5, 'offline engine still learned something');
  }
});

test('the prompt carries only this person, and the schema is strict', () => {
  const u = user();
  const text = buildUserMessage({ user: u, convo: newConversation(), pending: { text: 'Q?' }, answer: 'A', next: { text: 'Next?' } });
  assert.match(text, /Their answer: """A"""/);
  assert.equal(SCHEMA.additionalProperties, false);
  assert.deepEqual([...SCHEMA.required].sort(), Object.keys(SCHEMA.properties).sort());
});
