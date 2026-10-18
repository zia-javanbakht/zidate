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

test('weeks can start on any day, in any time zone', () => {
  // Friday 2026-10-16 is in the week that started on Friday; Thursday is still the week before.
  assert.equal(weekKey(new Date('2026-10-16T00:00:00Z'), { day: 5 }), '2026-W42');
  assert.equal(weekKey(new Date('2026-10-15T23:59:00Z'), { day: 5 }), '2026-W41');
  // Sunday weeks: Sunday 2026-10-18 starts a week whose key is the ISO week it falls in.
  assert.equal(weekKey(new Date('2026-10-18T00:00:00Z'), { day: 0 }), '2026-W42');
  assert.equal(weekKey(new Date('2026-10-24T23:00:00Z'), { day: 0 }), '2026-W42');
  // 23:30 UTC Thursday is already Friday morning in Tehran.
  assert.equal(weekKey(new Date('2026-10-15T23:30:00Z'), { day: 5, tz: 'Asia/Tehran' }), '2026-W42');
  assert.equal(weekKey(new Date('2026-10-16T03:00:00Z'), { day: 5, tz: 'America/New_York' }), '2026-W41');
});

test('the next start is local midnight on the chosen day', () => {
  assert.equal(nextWeekStart(new Date('2026-10-14T10:00:00Z'), { day: 5 }).toISOString(), '2026-10-16T00:00:00.000Z');
  assert.equal(nextWeekStart(new Date('2026-10-16T00:00:00Z'), { day: 5 }).toISOString(), '2026-10-23T00:00:00.000Z');
  // New York is on daylight time in October (UTC-4) and back on standard time in November (UTC-5).
  assert.equal(nextWeekStart(new Date('2026-10-14T10:00:00Z'), { day: 5, tz: 'America/New_York' }).toISOString(), '2026-10-16T04:00:00.000Z');
  assert.equal(nextWeekStart(new Date('2026-11-04T10:00:00Z'), { day: 5, tz: 'America/New_York' }).toISOString(), '2026-11-06T05:00:00.000Z');
  assert.equal(nextWeekStart(new Date('2026-10-14T10:00:00Z'), { day: 1, tz: 'Asia/Tokyo' }).toISOString(), '2026-10-18T15:00:00.000Z');
});
