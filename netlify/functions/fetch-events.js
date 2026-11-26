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
const SPONSOR_TABLE = 'tblqRN6Rl3HjrSVA9';
const FEATURED_TOPIC = 'career';

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

function compact(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function domainStem(raw) {
  try {
    return new URL(String(raw || '').trim()).hostname.toLowerCase().replace(/^www\./, '').split('.')[0];
  } catch (_) {
    return '';
  }
}

function isAffiliateUrl(raw) {
  try {
    return new URL(String(raw || '').trim()).searchParams.has('am_id');
  } catch (_) {
    return false;
  }
}

function sponsorKeys(rows) {
  const keys = [];
  for (const rec of rows) {
    const fields = rec.fields || {};
    for (const key of [
      compact(fields['Bootcamp Name']),
      domainStem(fields['Bootcamp URL']),
      domainStem(fields['Lead Redirect URL']),
    ]) {
      if (key && key.length >= 6) keys.push(key);
    }
  }
  return keys;
}

function isSponsorEvent(host, url, keys) {
  const hostKey = compact(host);
  let urlHost = '';
  try {
    urlHost = compact(new URL(String(url || '').trim()).hostname);
  } catch (_) {}
  return keys.some((k) => hostKey.includes(k) || urlHost.includes(k));
}

function eventFromFields(record, sponsors) {
  const fields = record.fields || {};
  const name = String(fields.Name || '').trim();
  const rawUrl = String(fields.URL || '').trim();
  // Affiliate links (am_id=jobhalo) keep their own tag; no extra ref.
  const url = isAffiliateUrl(rawUrl) ? rawUrl : lib.withCoachHaloRef(rawUrl);
  const start = String(fields.Start || '').trim();
  if (!name || !url || !start) return null;
  const cost = String(fields.Cost || fields.Price || '').trim().toLowerCase();
  const host = String(fields.Host || '').trim();
  return {
    id: String(record.id || '').trim(),
    name,
    host,
    summary: String(fields.Summary || '').trim(),
    when: lib.formatWhen(start),
    start,
    url,
    free: !cost || cost === 'free' || cost === '0' || cost === '$0',
    online: true,
    partner: fields.Featured === true || isSponsorEvent(host, rawUrl, sponsors || []),
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
      body: JSON.stringify({
        ok: true,
        configured: false,
        topic,
        count: 0,
        events: [],
      }),
    };
  }

  const now = new Date();
  try {
    const baseId = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE;
    const formula = "AND({Live}=1,{Topic}='" + topic + "')";
    const rows = await fetchAirtableRecords(token, baseId, tableId, formula);
    let sponsors = [];
    if (topic === FEATURED_TOPIC) {
      try {
        sponsors = sponsorKeys(await fetchAirtableRecords(token, baseId, SPONSOR_TABLE));
      } catch (_) {
        sponsors = [];
      }
    }
    const events = rows
      .map((row) => eventFromFields(row, sponsors))
      .filter((item) => item && lib.startsInWindow(item.start, now))
      .sort((a, b) => {
        if (a.partner !== b.partner) return a.partner ? -1 : 1;
        return Date.parse(a.start) - Date.parse(b.start);
      });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        configured: true,
        topic,
        count: events.length,
        events,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: 'fetch_failed' }),
    };
  }
};
