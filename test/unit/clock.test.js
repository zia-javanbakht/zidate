import test from 'node:test';
import assert from 'node:assert/strict';
import { weekKey, nextWeekStart } from '../../src/clock.js';

test('ISO week keys', () => {
  assert.equal(weekKey(new Date('2026-10-12T10:00:00Z')), '2026-W42');
  assert.equal(weekKey(new Date('2026-10-18T23:59:00Z')), '2026-W42');
  assert.equal(weekKey(new Date('2026-10-19T00:00:00Z')), '2026-W43');
  assert.equal(weekKey(new Date('2021-01-01T00:00:00Z')), '2020-W53');
});

test('next week starts on Monday', () => {
  assert.equal(nextWeekStart(new Date('2026-10-14T10:00:00Z')).toISOString(), '2026-10-19T00:00:00.000Z');
  assert.equal(nextWeekStart(new Date('2026-10-18T10:00:00Z')).toISOString(), '2026-10-19T00:00:00.000Z');
});
