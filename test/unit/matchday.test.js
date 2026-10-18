import test from 'node:test';
import assert from 'node:assert/strict';
import { currentWeek, nextWeek } from '../../src/matching.js';

const person = (settings) => ({ settings: { ...settings } });
// Change the day the way PUT /api/settings does: keep the week that is current now.
function change(u, day, at) {
  u.settings.weekFloor = currentWeek(u, at);
  u.settings.matchDay = day;
}

test('everyone starts on Monday, UTC', () => {
  const u = person({});
  assert.equal(currentWeek(u, new Date('2026-10-14T10:00:00Z')), '2026-W42');
  assert.equal(nextWeek(u, new Date('2026-10-14T10:00:00Z')).toISOString(), '2026-10-19T00:00:00.000Z');
});

test('moving the day later never repeats a week', () => {
  const u = person({});
  const mon = new Date('2026-10-12T09:00:00Z');
  change(u, 2, mon); // Monday -> Tuesday, on a Monday that already had picks
  assert.equal(currentWeek(u, mon), '2026-W42');
  assert.equal(currentWeek(u, new Date('2026-10-13T09:00:00Z')), '2026-W42');
  assert.equal(nextWeek(u, mon).toISOString(), '2026-10-20T00:00:00.000Z');
  assert.equal(currentWeek(u, new Date('2026-10-20T00:00:00Z')), '2026-W43');
});

test('moving the day earlier brings the next pair forward, once', () => {
  const u = person({ matchDay: 0 });
  const sat = new Date('2026-10-24T09:00:00Z');
  assert.equal(currentWeek(u, sat), '2026-W42');
  change(u, 6, sat); // Sunday -> Saturday, on a Saturday: today is the day
  assert.equal(currentWeek(u, sat), '2026-W43');
  change(u, 0, sat); // and back again: no extra pair
  assert.equal(currentWeek(u, sat), '2026-W43');
  change(u, 6, sat);
  assert.equal(currentWeek(u, sat), '2026-W43');
  assert.equal(nextWeek(u, sat).toISOString(), '2026-10-31T00:00:00.000Z');
});
