/**
 * Coach-Halo events introduction email. Sent through SendGrid after an event
 * signup asks to connect with the topic's coach. The coach address is read
 * server-side from the directory and is never returned to the browser.
 *
 * Shares only what the consent wording names: first name, email, topic, time
 * zone, availability, and what they want to talk about. Never the session note.
 *
 * Env: SENDGRID_API_KEY, optional SENDGRID_FROM_EMAIL, AIRTABLE_PAT or
 * AIRTABLE_TOKEN, optional AIRTABLE_BASE_ID, optional CH_DIRECTORY_TABLE_ID,
 * optional ADMIN_NOTIFY_EMAIL.
 */

const map = require('./event-coach-map.json');

const DEFAULT_BASE = 'appYMfUftdmhlnU6q';
const DEFAULT_DIRECTORY = 'tblUGp4lLiJyABtzt';
const FROM_DEFAULT = 'joaquinh@coach-halo.com';
const EMAIL_FIELDS = ['Email', 'Contact Me', 'Coach Email', 'Contact Email'];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

function mappedId(topic) {
  const id = String(map[topic] || '').trim();
  return /^rec[a-zA-Z0-9]{10,}$/.test(id) ? id : '';
}

function coachEmailFrom(fields) {
  for (const key of EMAIL_FIELDS) {
    const raw = String(fields[key] || '').trim();
    const value = raw.toLowerCase().startsWith('mailto:') ? raw.slice(7).split('?')[0].trim() : raw;
    if (validEmail(value)) return value;
  }
  return '';
}

async function coachContact(topic) {
  const recordId = mappedId(topic);
  const token = process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN || '';
  if (!recordId || !token) return null;
  const baseId = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE;
  const tableId = String(process.env.CH_DIRECTORY_TABLE_ID || DEFAULT_DIRECTORY).trim();
  const url =
    'https://api.airtable.com/v0/' +
    baseId +
    '/' +
    encodeURIComponent(tableId) +
    '/' +
    encodeURIComponent(recordId);
  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    const data = await res.json();
    const fields = data.fields || {};
    const email = coachEmailFrom(fields);
    if (!email) return null;
    return { email, name: String(fields['Coach Name'] || '').trim() };
  } catch (_) {
    return null;
  }
}

function introBody(input) {
  const coachFirst = firstName(input.coachName) || 'there';
  const who = input.name ? input.name + ' <' + input.email + '>' : input.email;
  const windows = String(input.availabilityText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const text = [
    'Hi ' + coachFirst + ',',
    who +
      ' asked to be connected for a free discovery call. They found you through the Coach-Halo ' +
      input.topicLabel +
      ' workshops page.',
    'What they would like to talk about:\n' + input.coachMessage,
    'Their time zone: ' + input.timeZone,
    'Times they are free:\n' + windows.join('\n'),
    'Please reply-all to coordinate a time. Those windows are a preference, not a booked appointment.',
    '— Coach-Halo',
  ].join('\n\n');

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0a0a0a;">' +
    '<p>Hi ' + escapeHtml(coachFirst) + ',</p>' +
    '<p>' + escapeHtml(who) + ' asked to be connected for a free discovery call. They found you through the Coach-Halo ' +
    escapeHtml(input.topicLabel) + ' workshops page.</p>' +
    '<p><strong>What they would like to talk about</strong><br>' +
    escapeHtml(input.coachMessage).replace(/\n/g, '<br>') + '</p>' +
    '<p><strong>Their time zone</strong><br>' + escapeHtml(input.timeZone) + '</p>' +
    '<p><strong>Times they are free</strong><br>' + windows.map(escapeHtml).join('<br>') + '</p>' +
    '<p>Please reply-all to coordinate a time. Those windows are a preference, not a booked appointment.</p>' +
    '<p>— Coach-Halo</p></div>';

  return { text, html };
}

async function sendIntroduction(input) {
  const apiKey = String(process.env.SENDGRID_API_KEY || '').trim();
  const fromAddr = String(process.env.SENDGRID_FROM_EMAIL || FROM_DEFAULT).trim();
  const opsAddr = String(process.env.ADMIN_NOTIFY_EMAIL || FROM_DEFAULT).trim();
  if (!apiKey.startsWith('SG.') || !fromAddr.toLowerCase().endsWith('@coach-halo.com')) {
    return { sent: false, reason: 'not_configured' };
  }
  if (!validEmail(input.email)) return { sent: false, reason: 'email' };

  const contact = await coachContact(input.topic);
  if (!contact) return { sent: false, reason: 'no_coach_email' };

  const body = introBody(Object.assign({}, input, { coachName: contact.name || input.coachName }));
  const cc = [{ email: input.email }];
  if (validEmail(opsAddr) && opsAddr.toLowerCase() !== contact.email.toLowerCase()) {
    cc.push({ email: opsAddr });
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: contact.email }], cc: cc }],
      from: { email: fromAddr, name: 'Coach-Halo Introductions' },
      reply_to: { email: input.email },
      subject:
        'Coach-Halo intro: ' + (input.name || input.email) + ' and ' + (contact.name || input.coachName),
      content: [
        { type: 'text/plain', value: body.text },
        { type: 'text/html', value: body.html },
      ],
      categories: ['ch_event_intro'],
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: false },
      },
    }),
  });
  if (!res.ok) {
    console.log('event intro status', res.status);
    return { sent: false, reason: 'send_failed' };
  }
  return { sent: true };
}

module.exports = {
  coachEmailFrom,
  introBody,
  sendIntroduction,
};
