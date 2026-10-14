const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('./functions/events-lib');

test('topic slugs are the seven niches', () => {
  assert.deepEqual(Object.keys(lib.TOPICS), [
    'career',
    'leadership',
    'business',
    'divorce',
    'relationships',
    'habits',
    'financial-planning',
  ]);
  assert.equal(lib.TOPICS['financial-planning'].coachName, 'Jake Randall');
  assert.equal(lib.topicSlug('divorce'), 'divorce');
  assert.equal(lib.topicSlug('coaches'), '');
});

test('outbound links get one coach-halo ref', () => {
  assert.equal(
    lib.withCoachHaloRef('https://host.example/register?id=1'),
    'https://host.example/register?id=1&ref=coach-halo.com'
  );
  assert.equal(
    lib.withCoachHaloRef('https://host.example/register?ref=coach-halo.com'),
    'https://host.example/register?ref=coach-halo.com'
  );
  assert.equal(lib.withCoachHaloRef('javascript:alert(1)'), '');
});

test('window keeps the next 35 days after 6am Pacific', () => {
  const now = new Date('2026-10-13T18:00:00.000Z');
  assert.equal(lib.startsInWindow('2026-10-14T16:00:00.000Z', now), true);
  assert.equal(lib.startsInWindow('2026-10-14T12:00:00.000Z', now), false);
  assert.equal(lib.startsInWindow('2026-11-04T16:00:00.000Z', now), true);
  assert.equal(lib.startsInWindow('2026-11-18T18:00:00.000Z', now), false);
  assert.equal(lib.startsInWindow('2026-10-13T17:00:00.000Z', now), false);
});

test('availability must be one to three future windows', () => {
  const now = new Date('2026-10-13T18:00:00.000Z');
  const good = lib.availabilityFromWindows(
    [{ date: '2026-10-20', start: '09:00', end: '10:00' }],
    'America/Los_Angeles',
    now
  );
  assert.equal(good.ok, true);
  assert.match(good.text, /2026-10-20 09:00–10:00 America\/Los_Angeles/);

  const past = lib.availabilityFromWindows(
    [{ date: '2026-10-01', start: '09:00', end: '10:00' }],
    'America/Los_Angeles',
    now
  );
  assert.equal(past.ok, false);

  const backwards = lib.availabilityFromWindows(
    [{ date: '2026-10-20', start: '10:00', end: '09:00' }],
    'America/Los_Angeles',
    now
  );
  assert.equal(backwards.ok, false);
});

test('introduction fields name Jake and omit the session note', () => {
  const fields = lib.introFields({
    consentTime: '2026-10-13T18:00:00.000Z',
    timeZone: 'America/Los_Angeles',
    availabilityText: '2026-10-20 09:00–10:00 America/Los_Angeles',
  });
  assert.equal(fields.Coach, 'Jake Randall');
  assert.equal(fields['Request status'], 'Requested');
  assert.equal(Object.prototype.hasOwnProperty.call(fields, 'Session note (do not share with coach)'), false);
  const alert = lib.alertFields({
    name: 'Ada',
    email: 'ada@example.com',
    topic: 'divorce',
    sessionNote: 'a workshop',
    signedUpFrom: 'Alert form',
  });
  assert.equal(alert['Session note (do not share with coach)'], 'a workshop');
  assert.equal(alert.Coach, undefined);
});
