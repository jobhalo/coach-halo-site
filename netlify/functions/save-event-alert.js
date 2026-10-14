/**
 * Saves a coach-halo.com/events alert, then an introduction request
 * only when the person asks on the personal financial planning page.
 *
 * Env: AIRTABLE_PAT or AIRTABLE_TOKEN, optional AIRTABLE_BASE_ID,
 * CH_EVENT_ALERTS_TABLE_ID — optional override. Default is Coach-Halo Event Alerts.
 */

const guard = require('./signup-guard');
const lib = require('./events-lib');

const DEFAULT_BASE = 'appYMfUftdmhlnU6q';
const DEFAULT_ALERTS_TABLE = 'tblcD101NOUECJgV3';

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
  const signedUpFrom = String(body.signed_up_from || 'Alert form')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 200);

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
  if (found) return json(200, { ok: true, id: found.id, existing: true });

  const created = await airtable(
    token,
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        records: [{ fields: lib.alertFields({ name, email, topic, sessionNote, signedUpFrom }) }],
        typecast: true,
      }),
    }
  );
  if (!created.ok) return json(502, { ok: false, error: 'save_failed' });
  const id = created.data.records && created.data.records[0] && created.data.records[0].id;
  return json(200, { ok: true, id: id || '' });
}

async function saveIntroduction(token, baseId, tableId, body) {
  const recordId = String(body.record_id || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const timeZone = String(body.time_zone || '').trim();
  if (!/^rec[a-zA-Z0-9]{10,}$/.test(recordId)) {
    return json(400, { ok: false, error: 'record', message: 'Save the event alert first.' });
  }
  if (body.consent !== true || body.consent_wording !== lib.CONSENT_TEXT) {
    return json(400, {
      ok: false,
      error: 'consent',
      message: 'Check the box if you want Coach-Halo to make this introduction.',
    });
  }
  if (!lib.isValidTimeZone(timeZone)) {
    return json(400, { ok: false, error: 'time_zone', message: 'Choose your time zone.' });
  }
  const availability = lib.availabilityFromWindows(body.windows, timeZone, new Date());
  if (!availability.ok) return json(400, { ok: false, error: 'availability', message: availability.message });

  const recordUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`;
  const current = await airtable(token, recordUrl, { method: 'GET' });
  if (!current.ok || !current.data.fields) {
    return json(400, { ok: false, error: 'record', message: 'Save the event alert first.' });
  }
  const fields = current.data.fields;
  const topic = lib.topicSlug(fields.Topic);
  const savedEmail = String(fields.Email || '').trim().toLowerCase();
  if (topic !== 'financial-planning' || savedEmail !== email) {
    return json(400, { ok: false, error: 'record', message: 'Save the event alert first.' });
  }

  const patched = await airtable(token, recordUrl, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: lib.introFields({
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
