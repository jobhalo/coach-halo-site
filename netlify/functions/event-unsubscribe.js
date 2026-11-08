/**
 * Unsubscribes an email from Coach-Halo event emails. GET shows a confirm
 * button so link scanners cannot unsubscribe anyone; POST (the button or the
 * List-Unsubscribe one-click header) marks every Event Alerts row for that
 * email as "Unsubscribed" in Send event welcome.
 *
 * Env: AIRTABLE_PAT or AIRTABLE_TOKEN, optional AIRTABLE_BASE_ID,
 * CH_EVENT_ALERTS_TABLE_ID, optional EVENT_UNSUBSCRIBE_SECRET.
 */

const welcomeEmail = require('./event-welcome');

const DEFAULT_BASE = 'appYMfUftdmhlnU6q';
const DEFAULT_ALERTS_TABLE = 'tblcD101NOUECJgV3';

function page(statusCode, title, message, form) {
  const html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>' +
    title +
    ' · Coach-Halo</title></head>' +
    '<body style="margin:0;font-family:Inter,Arial,Helvetica,sans-serif;background:#fafafa;color:#0a0a0a;">' +
    '<main style="max-width:480px;margin:72px auto;padding:32px;background:#fff;border:1px solid #e8e8e8;border-top:3px solid #0a0a0a;">' +
    '<p style="margin:0 0 20px;font-size:13px;font-weight:600;letter-spacing:2.8px;">COACH-HALO</p>' +
    '<h1 style="margin:0 0 12px;font-size:22px;">' + title + '</h1>' +
    '<p style="margin:0 0 20px;font-size:16px;line-height:25px;">' + message + '</p>' +
    (form || '') +
    '</main></body></html>';
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: html,
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

async function unsubscribe(token, baseId, tableId, recordId) {
  const tableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`;
  const current = await airtable(token, tableUrl + '/' + encodeURIComponent(recordId), { method: 'GET' });
  if (!current.ok || !current.data.fields) return false;
  const email = String(current.data.fields.Email || '').trim().toLowerCase();
  if (!email) return false;

  const found = await airtable(
    token,
    tableUrl +
      '?filterByFormula=' +
      encodeURIComponent("LOWER({Email})='" + formulaQuote(email) + "'") +
      '&fields%5B%5D=Email&pageSize=100',
    { method: 'GET' }
  );
  const ids = found.ok && Array.isArray(found.data.records) ? found.data.records.map((r) => r.id) : [recordId];
  if (!ids.includes(recordId)) ids.push(recordId);

  for (let i = 0; i < ids.length; i += 10) {
    const patched = await airtable(token, tableUrl, {
      method: 'PATCH',
      body: JSON.stringify({
        records: ids.slice(i, i + 10).map((id) => ({ id, fields: { 'Send event welcome': 'Unsubscribed' } })),
        typecast: true,
      }),
    });
    if (!patched.ok) return false;
  }
  return true;
}

exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const recordId = String(params.id || '').trim();
  const t = String(params.t || '').trim();
  if (!/^rec[a-zA-Z0-9]{10,}$/.test(recordId) || !welcomeEmail.validUnsubscribeToken(recordId, t)) {
    return page(400, 'Link not recognized', 'This unsubscribe link is not valid. Reply to any Coach-Halo email and we’ll remove you by hand.');
  }

  if (event.httpMethod === 'GET') {
    const action = '/.netlify/functions/event-unsubscribe?id=' + encodeURIComponent(recordId) + '&t=' + encodeURIComponent(t);
    return page(
      200,
      'Unsubscribe from event emails?',
      'You’ll stop getting Coach-Halo workshop emails at this address.',
      '<form method="POST" action="' + action + '"><button type="submit" style="font:inherit;font-size:15px;padding:10px 18px;background:#0a0a0a;color:#fff;border:0;cursor:pointer;">Unsubscribe</button></form>'
    );
  }
  if (event.httpMethod !== 'POST') return page(405, 'Not allowed', 'Use the button on the unsubscribe page.');

  const token = process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN || '';
  const baseId = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE;
  const tableId = String(process.env.CH_EVENT_ALERTS_TABLE_ID || DEFAULT_ALERTS_TABLE).trim();
  if (!token) return page(503, 'Try again later', 'We couldn’t process this right now. Reply to any Coach-Halo email and we’ll remove you by hand.');

  const done = await unsubscribe(token, baseId, tableId, recordId);
  if (!done) {
    return page(502, 'Try again later', 'We couldn’t process this right now. Reply to any Coach-Halo email and we’ll remove you by hand.');
  }
  return page(200, 'You’re unsubscribed', 'You won’t get more Coach-Halo workshop emails at this address.');
};
