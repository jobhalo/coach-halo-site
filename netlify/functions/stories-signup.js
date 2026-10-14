/**
 * Coach-Halo Stories signup persistence.
 * Env (optional): STORIES_ZAPIER_WEBHOOK_URL, AIRTABLE_TOKEN,
 * AIRTABLE_STORIES_BASE_ID, AIRTABLE_STORIES_TABLE_ID
 *
 * Success only if Zapier or Airtable confirms. Never fake a saved lead.
 */

const DEFAULT_ZAPIER =
  process.env.STORIES_ZAPIER_WEBHOOK_URL ||
  'https://hooks.zapier.com/hooks/catch/18483741/4t60ed9/';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT || '';
const STORIES_BASE_ID = process.env.AIRTABLE_STORIES_BASE_ID || 'apppbUQrzMKIHnPUl';
const STORIES_TABLE_ID = process.env.AIRTABLE_STORIES_TABLE_ID || 'tblOlVDRCDlos2MVv';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function asString(value) {
  if (value == null) return '';
  return String(value).trim();
}

async function postZapier(payload) {
  const res = await fetch(DEFAULT_ZAPIER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text: text.slice(0, 400) };
}

async function writeAirtable(payload) {
  if (!AIRTABLE_TOKEN) return { ok: false, skipped: true };
  const fields = {
    'First Name': asString(payload.firstName),
    Email: asString(payload.email),
    Situation: asString(payload.situation),
    Struggles: asString(payload.struggles),
    Source: asString(payload.source) || 'stories-landing',
    Status: asString(payload.status) || 'subscribed',
    'Coaching Interest': asString(payload.coachingInterest),
    'Recommended Coach': asString(payload.recommendedCoach),
    'Matched Coach Name': asString(payload.matchedCoachName),
  };
  const recordId = asString(payload.recordId);
  const isCreate = !recordId || recordId.startsWith('local_');
  const url = isCreate
    ? `https://api.airtable.com/v0/${STORIES_BASE_ID}/${STORIES_TABLE_ID}`
    : `https://api.airtable.com/v0/${STORIES_BASE_ID}/${STORIES_TABLE_ID}/${encodeURIComponent(recordId)}`;
  const body = isCreate ? { fields, typecast: true } : { fields, typecast: true };
  const res = await fetch(url, {
    method: isCreate ? 'POST' : 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, recordId: data.id || recordId || '' };
}

exports.handler = async function (event) {
  const headers = corsHeaders();
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'method_not_allowed' }) };
  }
  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'invalid_json' }) };
  }

  const email = asString(payload.email);
  const firstName = asString(payload.firstName);
  if (!email || !firstName) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'missing_fields' }) };
  }

  const zapierPayload = {
    event_type: payload.action || 'lead_saved',
    source: payload.source || 'stories-landing',
    first_name: firstName,
    email,
    situation: asString(payload.situation),
    struggles: asString(payload.struggles),
    coaching_interest: asString(payload.coachingInterest),
    coach_category: asString(payload.coachCategory),
    recommended_coach: asString(payload.recommendedCoach),
    matched_coach_id: asString(payload.matchedCoachId),
    matched_coach_name: asString(payload.matchedCoachName),
    matched_coach_email: asString(payload.matchedCoachEmail),
    record_id: asString(payload.recordId),
    status: asString(payload.status) || 'subscribed',
    signed_up_at: asString(payload.signedUpAt) || new Date().toISOString(),
    availability_timezone: asString(payload.availabilityTimezone),
    availability_slot1: asString(payload.availabilitySlot1),
    availability_slot2: asString(payload.availabilitySlot2),
    availability_slot3: asString(payload.availabilitySlot3),
    discussion_topic: asString(payload.discussionTopic),
    story_id: asString(payload.storyId),
    story_slug: asString(payload.storySlug),
    campaign: asString(payload.campaign),
    utm_source: asString(payload.utmSource),
    utm_medium: asString(payload.utmMedium),
  };

  let zapier = { ok: false };
  let airtable = { ok: false, skipped: true };
  try {
    zapier = await postZapier(zapierPayload);
  } catch (err) {
    zapier = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  try {
    airtable = await writeAirtable(payload);
  } catch (err) {
    airtable = { ok: false, error: String(err && err.message ? err.message : err) };
  }

  if (!zapier.ok && !airtable.ok) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ ok: false, error: 'persist_failed' }),
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      recordId: airtable.recordId || payload.recordId || '',
      zapier: zapier.ok,
      airtable: !!airtable.ok,
    }),
  };
};
