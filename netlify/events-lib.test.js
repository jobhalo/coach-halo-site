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
  assert.equal(lib.TOPICS.career.match.coachingTypeCategory, 'Career Coaching');
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

test('alert fields include welcome and introductions omit the session note', () => {
  const alert = lib.alertFields({
    name: 'Ada',
    email: 'ada@library.org',
    topic: 'career',
    sessionNote: 'a workshop',
    signedUpFrom: 'Alert form',
    heardFrom: 'reddit',
  });
  assert.equal(alert.Name, 'Ada');
  assert.equal(alert['Heard from'], 'reddit');
  assert.equal(alert['Session note (do not share with coach)'], 'a workshop');
  assert.equal(alert['Send event welcome'], undefined);
  assert.equal(alert['Event welcome subject'], undefined);
  assert.equal(alert['Event welcome body'], undefined);
  assert.equal(alert.Coach, undefined);

  const bare = lib.alertFields({
    email: 'ada@library.org',
    topic: 'relationships',
    signedUpFrom: 'Category page',
    utm: { utm_source: 'chatgpt', utm_campaign: 'events_comm' },
  });
  assert.equal(bare.Name, undefined);
  assert.match(bare['Signed up from'], /utm_source=chatgpt/);
  assert.match(bare['Signed up from'], /utm_campaign=events_comm/);
  assert.equal(bare['Event welcome body'], undefined);

  const fields = lib.introFields({
    coachName: 'Casey Coach',
    consentTime: '2026-10-13T18:00:00.000Z',
    timeZone: 'America/Los_Angeles',
    availabilityText: '2026-10-20 09:00–10:00 America/Los_Angeles',
  });
  assert.equal(fields.Coach, 'Casey Coach');
  assert.equal(fields['Request status'], 'Requested');
  assert.equal(
    fields['Consent wording'],
    lib.consentTextFor('Casey Coach')
  );
  assert.equal(Object.prototype.hasOwnProperty.call(fields, 'Session note (do not share with coach)'), false);
});

test('every topic has a welcome with a signed unsubscribe link', () => {
  process.env.EVENT_UNSUBSCRIBE_SECRET = 'test-secret';
  const welcome = require('./functions/event-welcome');
  assert.deepEqual(Object.keys(welcome.COPY), Object.keys(lib.TOPICS));
  for (const topic of Object.keys(lib.TOPICS)) {
    const mail = welcome.welcomeEmail(topic, 'recAAAAAAAAAAAAAA');
    assert.match(mail.subject, /workshops$/);
    assert.match(mail.html, new RegExp('/events/' + topic + '/'));
    assert.doesNotMatch(mail.html, /Job-Halo/);
    assert.match(mail.unsubscribeUrl, /event-unsubscribe\?id=recAAAAAAAAAAAAAA&t=[0-9a-f]{32}$/);
  }
  const token = welcome.unsubscribeToken('recAAAAAAAAAAAAAA');
  assert.equal(welcome.validUnsubscribeToken('recAAAAAAAAAAAAAA', token), true);
  assert.equal(welcome.validUnsubscribeToken('recBBBBBBBBBBBBBB', token), false);
  assert.equal(welcome.welcomeEmail('nope', 'recAAAAAAAAAAAAAA'), null);
});

test('the coach map covers every topic and leaves business unmapped', () => {
  const map = require('./functions/event-coach-map.json');
  assert.deepEqual(Object.keys(map), Object.keys(lib.TOPICS));
  assert.equal(map.business, '');
  for (const [slug, id] of Object.entries(map)) {
    if (slug === 'business') continue;
    assert.match(id, /^rec[a-zA-Z0-9]{10,}$/, slug + ' needs a directory record id');
  }
});

test('the intro email shares only the consented details', () => {
  const intro = require('./functions/event-intro-email');
  assert.equal(intro.coachEmailFrom({ 'Contact Me': 'coach@example.com' }), 'coach@example.com');
  assert.equal(intro.coachEmailFrom({ 'Contact Me': 'mailto:coach@example.com?subject=hi' }), 'coach@example.com');
  assert.equal(intro.coachEmailFrom({ 'Contact Me': 'not an email' }), '');
  assert.equal(intro.coachEmailFrom({}), '');

  const body = intro.introBody({
    coachName: 'Casey Coach',
    name: 'Ada',
    email: 'ada@library.org',
    topicLabel: 'money',
    timeZone: 'America/Los_Angeles',
    availabilityText: '2026-11-10 09:00–09:45 America/Los_Angeles',
    coachMessage: 'I want to build a budget that sticks.',
  });
  for (const value of [body.text, body.html]) {
    assert.match(value, /Hi Casey,/);
    assert.match(value, /ada@library\.org/);
    assert.match(value, /budget that sticks/);
    assert.match(value, /America\/Los_Angeles/);
    assert.doesNotMatch(value, /do not share with coach/i);
    assert.doesNotMatch(value, /session note/i);
  }
});