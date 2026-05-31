/**
 * Coach-Halo findyourcoach: same-origin proxy to Job-Halo Zapier lead logger.
 */

const UPSTREAM =
  process.env.CH_LEAD_LOG_UPSTREAM_URL ||
  'https://job-halo.com/.netlify/functions/log-findyourcoach-lead';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

exports.handler = async function (event) {
  const headers = corsHeaders();

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'method_not_allowed' }),
    };
  }

  try {
    const res = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: event.body || '{}',
    });
    const text = await res.text();
    return { statusCode: res.status, headers, body: text };
  } catch (e) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'proxy_failed',
        message: String(e && e.message ? e.message : e),
      }),
    };
  }
};
