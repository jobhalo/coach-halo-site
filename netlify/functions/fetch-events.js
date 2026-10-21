/**
 * Live events for one coach-halo.com/events niche.
 * GET /.netlify/functions/fetch-events?topic=career
 *
 * Env:
 *   AIRTABLE_PAT or AIRTABLE_TOKEN
 *   AIRTABLE_BASE_ID — optional, default appYMfUftdmhlnU6q
 *   CH_EVENTS_TABLE_ID — optional override. Default is Coach-Halo Events.
 */

const lib = require('./events-lib');

const DEFAULT_BASE = 'appYMfUftdmhlnU6q';
const DEFAULT_EVENTS_TABLE = 'tblJJVVYNwDwP28R2';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function queryTopic(event) {
  const raw = event.rawQuery || event.queryStringParameters || '';
  if (event.queryStringParameters && event.queryStringParameters.topic) {
    return event.queryStringParameters.topic;
  }
  const text = typeof raw === 'string' ? raw : '';
  const params = new URLSearchParams(text);
  return params.get('topic') || '';
}

async function fetchAirtableRecords(token, baseId, tableId, formula) {
  const records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`);
    if (formula) url.searchParams.set('filterByFormula', formula);
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = new Error('airtable_' + res.status);
      throw err;
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

function eventFromFields(record) {
  const fields = record.fields || {};
  const name = String(fields.Name || '').trim();
  const url = lib.withCoachHaloRef(fields.URL || '');
  const start = String(fields.Start || '').trim();
  if (!name || !url || !start) return null;
  const cost = String(fields.Cost || fields.Price || '').trim().toLowerCase();
  return {
    id: String(record.id || '').trim(),
    name,
    host: String(fields.Host || '').trim(),
    summary: String(fields.Summary || '').trim(),
    when: lib.formatWhen(start),
    start,
    url,
    free: !cost || cost === 'free' || cost === '0' || cost === '$0',
    online: true,
  };
}

exports.handler = async function (event) {
  const headers = corsHeaders();
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'method_not_allowed' }),
    };
  }

  const topic = lib.topicSlug(queryTopic(event));
  if (!topic) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'topic' }),
    };
  }

  const tableId = String(process.env.CH_EVENTS_TABLE_ID || DEFAULT_EVENTS_TABLE).trim();
  const token = process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN || '';
  if (!tableId || !token) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, configured: false, topic, count: 0, events: [] }),
    };
  }

  const now = new Date();
  try {
    const formula = "AND({Live}=1,{Topic}='" + topic + "')";
    const rows = await fetchAirtableRecords(
      token,
      process.env.AIRTABLE_BASE_ID || DEFAULT_BASE,
      tableId,
      formula
    );
    const events = rows
      .map((row) => eventFromFields(row))
      .filter((item) => item && lib.startsInWindow(item.start, now))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, configured: true, topic, count: events.length, events }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: 'fetch_failed' }),
    };
  }
};
