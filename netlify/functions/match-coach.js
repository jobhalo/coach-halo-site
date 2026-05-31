/**
 * Coach-Halo findyourcoach: match a lead to a JH Member coach (Airtable Full Coaches Directory).
 * Env: AIRTABLE_PAT or AIRTABLE_TOKEN, optional AIRTABLE_BASE_ID, AIRTABLE_COACHES_TABLE
 */

const DEFAULT_BASE = 'appYMfUftdmhlnU6q';
const DEFAULT_TABLE = 'tblUGp4lLiJyABtzt';
const RESUME_FOCUS_NEEDLE = 'Resume Assessment';

const CATEGORY_ALIASES = {
  'resume writing': 'Career Coaching',
};

const STOPWORDS = {
  that: 1, this: 1, with: 1, from: 1, have: 1, been: 1, your: 1, what: 1, when: 1,
  where: 1, they: 1, them: 1, their: 1, there: 1, would: 1, could: 1, about: 1,
  which: 1, these: 1, those: 1, looking: 1, trying: 1, really: 1, something: 1,
  anything: 1, because: 1, other: 1, just: 1, like: 1, want: 1, need: 1, help: 1,
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
}

function strArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String);
  return [String(v)];
}

function normalizeGender(g) {
  const s = String(g || '').toLowerCase().trim();
  if (['male', 'm', 'he', 'his', 'him', 'man', 'men'].includes(s)) return 'male';
  if (['female', 'f', 'she', 'her', 'hers', 'woman', 'women'].includes(s)) return 'female';
  return s;
}

function normalizeCategory(category) {
  let c = String(category || '').trim();
  if (!c) return '';
  if (c.includes(' - $')) c = c.split(' - $')[0].trim();
  const lower = c.toLowerCase();
  return CATEGORY_ALIASES[lower] || c;
}

function jhMemberTruthy(val) {
  return val === true;
}

function boostTruthy(fields) {
  const raw = fields['Coach Boost 🚀'];
  const v = Array.isArray(raw) ? (raw[0] != null ? String(raw[0]) : '') : String(raw || '');
  return v.toLowerCase().includes('boost this coach');
}

function metricFloat(fields, key) {
  const v = fields[key];
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').trim());
  return Number.isFinite(n) ? n : 0;
}

function buildMatchBlob(fields) {
  const cat = strArray(fields['Coach Categories']).join(' ');
  const focus = strArray(fields['Focus Areas']).join(' ');
  const ideal = String(
    fields['Tell us about your ideal client'] ||
      fields['Ideal Client'] ||
      fields['Ideal client'] ||
      fields['Who I Work With'] ||
      ''
  );
  const about = String(fields['About Me & My Practice'] || '');
  const outcome = String(
    fields[
      'What specific result do your ideal clients typically achieve after working with you, and in what timeframe?'
    ] || ''
  );
  return [cat, focus, ideal.slice(0, 600), about.slice(0, 1000), outcome.slice(0, 500)]
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasResumeFocus(fields) {
  const areas = strArray(fields['Focus Areas']).join(' ').toLowerCase();
  return areas.includes(RESUME_FOCUS_NEEDLE.toLowerCase());
}

function coachMatchesCategory(fields, categoryLower) {
  return strArray(fields['Coach Categories']).some(
    (c) => String(c).trim().toLowerCase() === categoryLower
  );
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((w) => w.length > 3 && !STOPWORDS[w]);
}

function scoreLeadTopic(topic, blob) {
  if (!topic.trim() || !blob) return 0;
  const words = tokenize(topic);
  const seen = {};
  let score = 0;
  for (const w of words) {
    if (seen[w]) continue;
    seen[w] = 1;
    if (blob.includes(w)) score += 1;
  }
  return score;
}

function truncateReview(text, maxLen) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen);
  const last = slice.lastIndexOf(' ');
  return (last > 40 ? slice.slice(0, last) : slice) + '…';
}

function firstGivenName(fullName) {
  const honorifics = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'mx', 'prof', 'rev', 'hon']);
  const parts = String(fullName || '').trim().split(/\s+/);
  for (const p of parts) {
    const base = p.toLowerCase().replace(/\.$/, '');
    if (honorifics.has(base)) continue;
    return p;
  }
  return parts[0] || 'Coach';
}

function displayTitle(fields, matchedCategory) {
  const title = String(fields['Coach title'] || '').trim();
  if (title) return title;
  return matchedCategory || 'Coach';
}

async function fetchAllCoaches(token, baseId, table) {
  const coaches = [];
  let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    if (offset) u.searchParams.set('offset', offset);
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`airtable_${res.status}:${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    for (const rec of data.records || []) {
      coaches.push({ id: rec.id, fields: rec.fields || {} });
    }
    offset = data.offset;
  } while (offset);
  return coaches;
}

function findJakeRandall(records, genderPreference) {
  for (const rec of records) {
    const name = String(rec.fields['Coach Name'] || '').trim();
    if (!name.toLowerCase().includes('jake') || !name.toLowerCase().includes('randall')) continue;
    if (!jhMemberTruthy(rec.fields['JH Member?'])) continue;
    if (genderPreference && genderPreference !== 'No preference') {
      const g = normalizeGender(rec.fields['Coach Gender']);
      if (g && g !== normalizeGender(genderPreference)) continue;
    }
    return rec;
  }
  return null;
}

function pickBestCoach(records, category, genderPreference, leadTopic, resumeSearch) {
  const rawLower = String(category || '').toLowerCase();
  const normalized = normalizeCategory(category);
  if (!normalized) return null;
  const catLower = normalized.toLowerCase();

  if (catLower === 'personal financial planning') {
    const jake = findJakeRandall(records, genderPreference);
    if (jake) return { record: jake, matchedCategory: normalized };
  }

  let pool = records.filter((r) => coachMatchesCategory(r.fields, catLower));
  if (!pool.length) return null;

  if (resumeSearch || rawLower.includes('resume')) {
    pool = pool.filter((r) => hasResumeFocus(r.fields));
    if (!pool.length) return null;
  }

  pool = pool.filter((r) => jhMemberTruthy(r.fields['JH Member?']));
  if (!pool.length) return null;

  const boosted = pool.filter((r) => boostTruthy(r.fields));
  if (boosted.length) pool = boosted;

  if (genderPreference && genderPreference !== 'No preference') {
    const want = normalizeGender(genderPreference);
    const filtered = pool.filter((r) => {
      const raw = r.fields['Coach Gender'];
      const g = normalizeGender(Array.isArray(raw) ? raw[0] : raw);
      return g === want;
    });
    if (!filtered.length) return null;
    pool = filtered;
  }

  const hasZeroConversion = pool.some((r) => metricFloat(r.fields, 'Conversion (#)') === 0);
  if (hasZeroConversion) {
    pool = pool.filter((r) => metricFloat(r.fields, 'Conversion (#)') === 0);
    if (!pool.length) return null;
  }

  const minOutreach = Math.min(...pool.map((r) => metricFloat(r.fields, 'Total Outreach')));
  pool = pool.filter((r) => metricFloat(r.fields, 'Total Outreach') === minOutreach);
  if (!pool.length) return null;

  const topic = String(leadTopic || '').trim();
  let best = null;
  let bestScore = -1;
  let bestJh = Infinity;
  for (const rec of pool) {
    const blob = buildMatchBlob(rec.fields);
    const rel = topic ? scoreLeadTopic(topic, blob) : 0;
    const jh = metricFloat(rec.fields, 'JH_Promotion_Count');
    if (
      rel > bestScore ||
      (rel === bestScore && jh < bestJh)
    ) {
      bestScore = rel;
      bestJh = jh;
      best = rec;
    }
  }

  return best ? { record: best, matchedCategory: normalized } : null;
}

function recordToMatchPayload(record, matchedCategory, leadStyle) {
  const f = record.fields;
  const name = String(f['Coach Name'] || f['Coach title'] || 'Coach').trim();
  const first = firstGivenName(name);
  const reviewRaw = String(f['Customer Review'] || f['Customer Review:'] || '').trim();
  const review = truncateReview(reviewRaw, 320);
  return {
    ok: true,
    record_id: record.id,
    name,
    short: first,
    title: displayTitle(f, matchedCategory),
    image: String(f['Outseta Image URL'] || '').trim(),
    review: review || null,
    reviewBy: review ? 'Coach-Halo client' : null,
    directory_link: String(f['Directory Link Short'] || '').trim(),
    coach_email: String(f['Contact Me'] || f['Coach Email'] || '').trim(),
    matched_category: matchedCategory,
    lead_style: leadStyle || null,
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

  const token = process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN;
  if (!token) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'missing_airtable_pat',
        hint: 'Set AIRTABLE_PAT in Netlify environment variables',
      }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'invalid_json' }),
    };
  }

  const category =
    body.coachingTypeCategory ||
    body.category ||
    body.coachingType ||
    '';
  const genderPreference = body.genderPreference || body.gender_preference || null;
  const leadTopic = [body.goals, body.notes, body.style]
    .filter(Boolean)
    .join(' ')
    .trim();
  const leadStyle = body.style || null;
  const resumeSearch =
    String(body.coachingType || '').toLowerCase().includes('resume') ||
    String(category).toLowerCase().includes('resume');

  const baseId = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE;
  const table = process.env.AIRTABLE_COACHES_TABLE || DEFAULT_TABLE;

  try {
    const records = await fetchAllCoaches(token, baseId, table);
    const picked = pickBestCoach(records, category, genderPreference, leadTopic, resumeSearch);
    if (!picked) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'no_match',
          message: 'No coach available for this category and preferences right now.',
        }),
      };
    }
    const match = recordToMatchPayload(picked.record, picked.matchedCategory, leadStyle);
    return { statusCode: 200, headers, body: JSON.stringify(match) };
  } catch (e) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'match_failed',
        message: String(e && e.message ? e.message : e),
      }),
    };
  }
};
