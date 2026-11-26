/**
 * 1–2 sentences connecting an events signup to a complimentary coach intro.
 * POST /.netlify/functions/coach-bridge-copy
 *
 * Env:
 *   OPENAI_API_KEY (required)
 *   OPENAI_BRIDGE_MODEL (optional, default gpt-4o)
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o';
const MAX_CHARS = 400;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function cleanText(value, max) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max || 300);
}

function sanitizeBridge(text) {
  let out = String(text || '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!out) return '';
  if (/^(i'?m sorry|i cannot|i can'?t|as an ai)/i.test(out)) return '';
  if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS).replace(/\s+\S*$/, '').trim();
  return out;
}

function buildMessages(body) {
  const topicLabel = cleanText(body.topicLabel, 80) || cleanText(body.topic, 40) || 'this topic';
  const topicBlurb = cleanText(body.topicBlurb, 200);
  const eventTitle = cleanText(body.eventTitle, 160);
  const coachName = cleanText(body.coachName, 80);
  const coachLine = cleanText(body.coachLine, 240);

  const facts = [
    'Topic label: ' + topicLabel,
    topicBlurb ? 'Topic blurb: ' + topicBlurb : '',
    eventTitle ? 'Selected event title: ' + eventTitle : 'Selected event title: (none — category alert signup)',
    'Coach name: ' + (coachName || 'a coach'),
    coachLine ? 'Coach expertise / match line (use only this; do not invent more): ' + coachLine : 'Coach expertise: (not provided)',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    {
      role: 'system',
      content:
        'You write short Coach-Halo Events copy. Output exactly 1 or 2 plain-text sentences. ' +
        'Connect the event or topic to what the visitor could discuss with the named coach on a complimentary introduction. ' +
        'Use only the facts given. Do not invent credentials, specialties, certifications, or outcomes. ' +
        'Do not promise results. Soft language only (talk about, explore, how that shows up). ' +
        'No therapy, medical, legal, or financial advice claims. No markdown, bullets, or quotation marks wrapping the whole reply.',
    },
    {
      role: 'user',
      content: 'Write the bridge copy from these facts:\n\n' + facts,
    },
  ];
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, error: 'missing_api_key' }),
    };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    body = {};
  }

  const coachName = cleanText(body.coachName, 80);
  if (!coachName) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, error: 'missing_coach' }),
    };
  }

  const model = cleanText(process.env.OPENAI_BRIDGE_MODEL, 64) || DEFAULT_MODEL;

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.4,
        max_tokens: 180,
        messages: buildMessages(body),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'openai_failed',
          status: res.status,
        }),
      };
    }
    const raw =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    const bridge = sanitizeBridge(raw);
    if (!bridge) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: false, error: 'empty_response' }),
      };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, bridge_copy: bridge }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'request_failed',
        message: String(e && e.message ? e.message : e),
      }),
    };
  }
};
