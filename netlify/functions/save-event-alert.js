/**
 * Saves a coach-halo.com/events alert, sends the welcome email, then an
 * introduction request only when the person asks after a coach match.
 *
 * Env: AIRTABLE_PAT or AIRTABLE_TOKEN, optional AIRTABLE_BASE_ID,
 * CH_EVENT_ALERTS_TABLE_ID, SENDGRID_API_KEY, optional SENDGRID_FROM_EMAIL.
 */

const guard = require('./signup-guard');
const lib = require('./events-lib');

const DEFAULT_BASE = 'appYMfUftdmhlnU6q';
const DEFAULT_ALERTS_TABLE = 'tblcD101NOUECJgV3';
const FROM_DEFAULT = 'joaquinh@coach-halo.com';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function readJson(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || '';
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}

function httpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString().slice(0, 400);
  } catch (_) {
    return '';
  }
}

function formulaQuote(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function airtable(token, url, options) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options && options.headers),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function sendWelcomeEmail(fields) {
  const apiKey = String(process.env.SENDGRID_API_KEY || '').trim();
  const fromAddr = String(process.env.SENDGRID_FROM_EMAIL || FROM_DEFAULT).trim();
  const to = String(fields.Email || '').trim();
  const subject = String(fields['Event welcome subject'] || lib.welcomeSubject()).trim();
  const body = String(fields['Event welcome body'] || '').trim();
  if (!apiKey.startsWith('SG.') || !to || !subject || !body) {
    return { sent: false, reason: 'not_configured' };
  }
  if (!fromAddr.toLowerCase().endsWith('@coach-halo.com')) {
    return { sent: false, reason: 'from_address' };
  }
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromAddr, name: 'Coach-Halo' },
      reply_to: { email: fromAddr, name: 'Coach-Halo' },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return { sent: false, reason: 'send_failed', detail: err.slice(0, 200) };
  }
  return { sent: true };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const token = process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN || '';
  const tableId = String(process.env.CH_EVENT_ALERTS_TABLE_ID || DEFAULT_ALERTS_TABLE).trim();
  const baseId = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE;
  if (!token || !tableId) {
    return json(503, {
      ok: false,
      error: 'not_configured',
      message: 'Event alerts are not set up yet.',
    });
  }

  const body = readJson(event);
  if (!body || typeof body !== 'object') return json(400, { ok: false, error: 'invalid_json' });

  const action = String(body.action || 'alert').trim();
  if (action === 'introduction') return saveIntroduction(token, baseId, tableId, body);
  if (action === 'alert') return saveAlert(token, baseId, tableId, body);
  return json(400, { ok: false, error: 'action' });
};

async function saveAlert(token, baseId, tableId, body) {
  const name = String(body.name || body.first_name || '').trim();
  const email = String(body.email || '').trim();
  const topic = lib.topicSlug(body.topic);
  const sessionNote = String(body.session_note || '').trim().slice(0, 500);
  const signedUpFrom = String(body.signed_up_from || 'Category page')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  const eventId = String(body.event_id || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40);
  const eventUrl = httpUrl(body.event_url);

  const nameProblem = guard.jhSignupNameProblem(name);
  if (!name || nameProblem) {
    return json(400, { ok: false, error: 'name', message: nameProblem || 'Use your real name.' });
  }
  const emailProblem = guard.jhSignupEmailProblem(email);
  if (!email || emailProblem) {
    return json(400, {
      ok: false,
      error: 'email',
      message: emailProblem || 'Use an email address you can actually receive mail at.',
    });
  }
  if (!topic) return json(400, { ok: false, error: 'topic' });

  const existingUrl =
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}` +
    `?filterByFormula=${encodeURIComponent(
      "AND(LOWER({Email})='" + formulaQuote(email.toLowerCase()) + "',{Topic}='" + topic + "')"
    )}&maxRecords=1`;
  const existing = await airtable(token, existingUrl, { method: 'GET' });
  if (!existing.ok) return json(502, { ok: false, error: 'save_failed' });
  const found = existing.data.records && existing.data.records[0];
  if (found) {
    return json(200, {
      ok: true,
      id: found.id,
      existing: true,
      welcome_sent: String((found.fields || {})['Send event welcome'] || '') === 'Sent',
    });
  }

  const fields = lib.alertFields({ name, email, topic, sessionNote, signedUpFrom, eventId, eventUrl });
  const created = await airtable(
    token,
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        records: [{ fields }],
        typecast: true,
      }),
    }
  );
  if (!created.ok) return json(502, { ok: false, error: 'save_failed' });
  const record = created.data.records && created.data.records[0];
  const id = record && record.id;

  let welcomeSent = false;
  try {
    const welcome = await sendWelcomeEmail(fields);
    welcomeSent = !!welcome.sent;
    if (welcomeSent && id) {
      await airtable(
        token,
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ fields: { 'Send event welcome': 'Sent' }, typecast: true }),
        }
      );
    }
  } catch (_) {
    welcomeSent = false;
  }

  return json(200, { ok: true, id: id || '', welcome_sent: welcomeSent });
}

async function saveIntroduction(token, baseId, tableId, body) {
  const recordId = String(body.record_id || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const timeZone = String(body.time_zone || '').trim();
  const coachName = String(body.coach_name || body.coachName || '').trim();
  if (!/^rec[a-zA-Z0-9]{10,}$/.test(recordId)) {
    return json(400, { ok: false, error: 'record', message: 'Save the event alert first.' });
  }
  if (!coachName) {
    return json(400, { ok: false, error: 'coach', message: 'Choose a coach introduction first.' });
  }
  const expectedConsent = lib.consentTextFor(coachName);
  if (body.consent !== true || body.consent_wording !== expectedConsent) {
    return json(400, {
      ok: false,
      error: 'consent',
      message: 'Check the box if you want Coach-Halo to make this introduction.',
    });
  }
  if (!lib.isValidTimeZone(timeZone)) {
    return json(400, { ok: false, error: 'time_zone', message: 'Choose your time zone.' });
  }
  const coachMessage = String(body.coach_message || '').trim().slice(0, 600);
  if (coachMessage.length < 12) {
    return json(400, {
      ok: false,
      error: 'coach_message',
      message: 'Add 1–2 sentences about what you’d like to work on.',
    });
  }
  const availability = lib.availabilityFromWindows(body.windows, timeZone, new Date());
  if (!availability.ok) return json(400, { ok: false, error: 'availability', message: availability.message });
  availability.text += '\n\nWhat they want to talk about:\n' + coachMessage;

  const recordUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`;
  const current = await airtable(token, recordUrl, { method: 'GET' });
  if (!current.ok || !current.data.fields) {
    return json(400, { ok: false, error: 'record', message: 'Save the event alert first.' });
  }
  const fields = current.data.fields;
  const topic = lib.topicSlug(fields.Topic);
  const savedEmail = String(fields.Email || '').trim().toLowerCase();
  if (!topic || savedEmail !== email) {
    return json(400, { ok: false, error: 'record', message: 'Save the event alert first.' });
  }

  const patched = await airtable(token, recordUrl, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: lib.introFields({
        coachName,
        consentTime: new Date().toISOString(),
        timeZone,
        availabilityText: availability.text,
      }),
      typecast: true,
    }),
  });
  if (!patched.ok) return json(502, { ok: false, error: 'save_failed' });
  return json(200, { ok: true, id: recordId });
}
