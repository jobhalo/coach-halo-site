/**
 * Coach-Halo coach match.
 * Career and leadership event signups use the Job-Halo signup rotation
 * (fetch-coaches + the same fairness sort as the job-alert form).
 * Every other request proxies to Job-Halo match-coach.
 * Env: CH_MATCH_UPSTREAM_URL, CH_FETCH_COACHES_URL (optional overrides)
 */

const UPSTREAM =
  process.env.CH_MATCH_UPSTREAM_URL ||
  'https://job-halo.com/.netlify/functions/match-coach';

const FETCH_COACHES_URL =
  process.env.CH_FETCH_COACHES_URL ||
  'https://job-halo.com/.netlify/functions/fetch-coaches';

const FAIR_EVENT_TOPICS = new Set(['career', 'leadership']);

const STOPWORDS = {
  that: 1,
  this: 1,
  with: 1,
  from: 1,
  have: 1,
  been: 1,
  your: 1,
  what: 1,
  when: 1,
  where: 1,
  they: 1,
  them: 1,
  their: 1,
  there: 1,
  would: 1,
  could: 1,
  about: 1,
  which: 1,
  these: 1,
  those: 1,
  looking: 1,
  trying: 1,
  really: 1,
  something: 1,
  anything: 1,
  because: 1,
  other: 1,
  just: 1,
  like: 1,
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function challengeNeedsResumeHelp(text) {
  return /\b(resume|cv|cvs|curriculum\s+vitae|cover\s+letter|ats|applicant\s+tracking)\b/i.test(
    String(text || '')
  );
}

function coachHasResumeFocus(coach) {
  if (!coach) return false;
  if (typeof coach.has_resume_focus === 'boolean') return coach.has_resume_focus;
  return String(coach.match_blob || '').includes('resume assessment');
}

function scoreCoachMatch(text, coach) {
  const lower = String(text || '').toLowerCase();
  const blob = String((coach && coach.match_blob) || '');
  if (!lower.trim() || !blob) return 0;
  const words = lower.split(/[^a-z0-9+]+/).filter((word) => word.length > 3 && !STOPWORDS[word]);
  const seen = {};
  let score = 0;
  for (const word of words) {
    if (seen[word]) continue;
    seen[word] = 1;
    if (blob.includes(word)) score += 1;
  }
  return score;
}

function pickFairCoach(pool) {
  if (!pool || !pool.length) return null;
  return pool.slice().sort((a, b) => {
    const ba = a.fairness_band != null ? a.fairness_band : a.pay_tier === 'high' ? 0 : 1;
    const bb = b.fairness_band != null ? b.fairness_band : b.pay_tier === 'high' ? 0 : 1;
    if (ba !== bb) return ba - bb;
    const ac = a.conversion_count || 0;
    const bc = b.conversion_count || 0;
    if (ac !== bc) return ac - bc;
    const al = a.conversion_last_month || 0;
    const bl = b.conversion_last_month || 0;
    if (al !== bl) return al - bl;
    const a3 = a.conversion_3mo || 0;
    const b3 = b.conversion_3mo || 0;
    if (a3 !== b3) return a3 - b3;
    return (a.total_outreach || 0) - (b.total_outreach || 0);
  })[0];
}

/** Same selection as the Job-Halo job-alert form. `note` is the visitor's session note. */
function pickSignupCoach(coaches, note) {
  let pool = Array.isArray(coaches) ? coaches : [];
  if (!pool.length) return null;
  const text = String(note || '').trim();
  if (challengeNeedsResumeHelp(text)) {
    const resumePool = pool.filter(coachHasResumeFocus);
    if (resumePool.length) pool = resumePool;
  }
  if (!text) return pickFairCoach(pool);
  const scored = pool.map((coach) => ({ coach, score: scoreCoachMatch(text, coach) }));
  let maxScore = 0;
  for (const row of scored) {
    if (row.score > maxScore) maxScore = row.score;
  }
  if (maxScore === 0) return pickFairCoach(pool);
  return pickFairCoach(scored.filter((row) => row.score === maxScore).map((row) => row.coach));
}

function fairMatchPayload(coach) {
  return {
    ok: true,
    name: coach.name,
    title: coach.role || '',
    image: coach.outseta_image_url || '',
    match_reason: '',
    free_intro: true,
  };
}

function usesSignupRotation(body) {
  const source = String((body && body.source) || '').trim();
  const topic = String((body && body.topic) || '').trim();
  return source === 'coach-halo-events' && FAIR_EVENT_TOPICS.has(topic);
}

async function signupRotationMatch(body) {
  const res = await fetch(FETCH_COACHES_URL, { headers: { Accept: 'application/json' } });
  const data = await res.json();
  if (!res.ok || !data || !data.ok) {
    const err = new Error('fetch_coaches_failed');
    err.status = res.status;
    throw err;
  }
  const picked = pickSignupCoach(data.coaches, body.notes || '');
  if (!picked || !picked.name) return { ok: false, error: 'no_match' };
  return fairMatchPayload(picked);
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

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    body = {};
  }

  if (usesSignupRotation(body)) {
    try {
      const match = await signupRotationMatch(body);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(match),
      };
    } catch (e) {
      /* Fall through to the category matcher so the signup can still offer a coach. */
    }
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

exports.pickSignupCoach = pickSignupCoach;
exports.usesSignupRotation = usesSignupRotation;
