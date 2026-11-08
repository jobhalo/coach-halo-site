/**
 * One public coach for an event topic. The map is empty until an owner sets
 * a Full Coaches Directory record id. Unmapped topics return no coach.
 *
 * Env: AIRTABLE_PAT or AIRTABLE_TOKEN, optional AIRTABLE_BASE_ID,
 * optional CH_DIRECTORY_TABLE_ID.
 */

const lib = require('./events-lib');
const map = require('./event-coach-map.json');

const DEFAULT_BASE = 'appYMfUftdmhlnU6q';
const DEFAULT_DIRECTORY = 'tblUGp4lLiJyABtzt';

function headers() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300',
  };
}

function json(statusCode, body) {
  return { statusCode, headers: headers(), body: JSON.stringify(body) };
}

function httpsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return '';
    return parsed.toString().slice(0, 400);
  } catch (_) {
    return '';
  }
}

function mappedId(topic) {
  const id = String(map[topic] || '').trim();
  return /^rec[a-zA-Z0-9]{10,}$/.test(id) ? id : '';
}

function publicCoach(fields) {
  const name = String(fields['Coach Name'] || '').trim();
  if (!name) return null;
  const line = String(fields['Coach title'] || '').trim().replace(/\s+/g, ' ').slice(0, 140);
  const coach = {
    name: name.slice(0, 80),
    image: httpsUrl(fields['Outseta Image URL']),
    line: line,
    profile_url: httpsUrl(fields['Directory Link Short']),
  };
  return coach;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });
  const params = event.queryStringParameters || {};
  const topic = lib.topicSlug(params.topic);
  if (!topic) return json(400, { ok: false, error: 'topic' });
  const recordId = mappedId(topic);
  if (!recordId) return json(200, { ok: true, topic, coach: null });

  const token = process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN || '';
  const baseId = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE;
  const tableId = String(process.env.CH_DIRECTORY_TABLE_ID || DEFAULT_DIRECTORY).trim();
  if (!token) return json(200, { ok: true, topic, coach: null });

  const url =
    'https://api.airtable.com/v0/' +
    baseId +
    '/' +
    encodeURIComponent(tableId) +
    '/' +
    encodeURIComponent(recordId);
  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return json(200, { ok: true, topic, coach: null });
    const data = await res.json();
    return json(200, { ok: true, topic, coach: publicCoach(data.fields || {}) });
  } catch (_) {
    return json(200, { ok: true, topic, coach: null });
  }
};
