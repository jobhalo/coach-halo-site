/**
 * Coach signup from coach-halo.com/join/.
 * Free signup (You're in, no payment) writes the free-coach table.
 * Paid signup writes the paid profile table only when paidConfirmed is true,
 * which is set after Stripe confirms payment.
 *
 * Never writes JH Member?, Approved?, Send Confirmation, or Ship?.
 * Those fields trigger notifications.
 *
 * Env: AIRTABLE_TOKEN (or AIRTABLE_PAT),
 *      OUTSETA_API_KEY and OUTSETA_API_SECRET
 *      (or OUTSETA_API_KEY already set to "key:secret").
 */

const LIST_UID = "7maRvjQE";
const DOMAIN = process.env.OUTSETA_DOMAIN || "job-halo.outseta.com";
const PROFILE_BASE = "apppbUQrzMKIHnPUl";
const FREE_TABLE = "tbldOPTV5xCkv23yc";
const PAID_TABLE = "tbl3FW3kF6KsQYi9c";

// Exact names, plus anything that would check membership, approval, or send a notice.
const DO_NOT_TOUCH = new Set([
  "jh member?",
  "jh member date",
  "approved",
  "approved?",
  "send confirmation",
  "send confirmation?",
  "send updated profile confirmation",
  "ship?",
  "directory- email trigger",
  "newsletter ad - email trigger",
]);

function headers() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function json(statusCode, body) {
  return { statusCode, headers: headers(), body: JSON.stringify(body) };
}

function clip(value, max) {
  const text = String(value == null ? "" : value).trim();
  return text.length > max ? text.slice(0, max) : text;
}

function authHeader() {
  const raw = String(process.env.OUTSETA_API_KEY || "").trim();
  const secret = String(
    process.env.OUTSETA_API_SECRET || process.env.OUTSETA_SECRET_KEY || ""
  ).trim();
  const token = raw.includes(":") ? raw : secret ? raw + ":" + secret : "";
  if (!token || token.indexOf(":") < 1 || token.endsWith(":")) return "";
  return "Outseta " + token;
}

function listify(value) {
  if (!Array.isArray(value)) return "";
  return value
    .map(function (item) { return clip(item, 80); })
    .filter(Boolean)
    .slice(0, 12)
    .join(", ");
}

function line(label, value) {
  const text = clip(value, 700);
  return text ? label + ": " + text : "";
}

function profileText(payload) {
  return [
    line("Headline", payload.title),
    line("Coach type", payload.coachType),
    line("Helps with", listify(payload.offers)),
    line("Website", payload.website),
    line("Works with", listify(payload.levels)),
    line("Industries", payload.industries),
    line("Calendar", [clip(payload.hasCal, 20), clip(payload.cal, 300)].filter(Boolean).join(" ")),
    line("First call", payload.freecall),
    line("Hourly rate", payload.price),
    line("Based in", payload.tz),
    line("Languages", listify(payload.langs)),
    line("Capacity", payload.capacity),
    line("Heard about us", payload.heard),
    line("Plan", payload.plan),
    line("Bio", payload.bio),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);
}

function blockedField(name) {
  const normalized = String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
  return DO_NOT_TOUCH.has(normalized) || normalized.startsWith("jh member") || normalized.includes("send confirmation") || normalized.includes("email trigger") || normalized === "ship?";
}

function safeFields(fields) {
  const out = {};
  Object.keys(fields).forEach(function (key) {
    if (blockedField(key)) {
      const err = new Error("blocked_field");
      err.field = key;
      throw err;
    }
    const value = fields[key];
    if (value == null || value === "") return;
    if (Array.isArray(value) && !value.length) return;
    out[key] = value;
  });
  return out;
}

function airtableToken() {
  return String(process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT || "").trim();
}

function idealClient(payload) {
  return [
    line("Helps with", listify(payload.offers)),
    line("Works with", listify(payload.levels)),
    line("Industries", payload.industries),
    line("Languages", listify(payload.langs)),
    line("Based in", payload.tz),
    line("Capacity", payload.capacity),
    line("First call", payload.freecall),
    line("Website", payload.website),
    line("Heard about us", payload.heard),
    line("Plan chosen", payload.plan),
  ].filter(Boolean).join("\n").slice(0, 4000);
}

const FREE_TYPE = {
  career: "Career Coaching",
  life: "Life Coaching",
  financial: "Personal Financial Planning",
  relationship: "Relationship Coaching",
  business: "Business Coaching",
  wellness: "Health and Fitness Coaching",
};

function isPaidSignup(payload) {
  return payload.paidConfirmed === true && (payload.plan === "monthly" || payload.plan === "annual");
}

function freeFields(payload, name, email) {
  const parts = name.split(/\s+/);
  const fields = {
    "Coach Name": parts[0],
    "Coach Email": email,
    "Account Type": "Free",
    "Status": "Subscribed",
    "Ideal Client": idealClient(payload),
  };
  if (parts.length > 1) fields["Coach Last Name"] = parts.slice(1).join(" ");
  const coachingType = FREE_TYPE[clip(payload.coachType, 40)];
  if (coachingType) fields["Coaching_Type"] = coachingType;
  return safeFields(fields);
}

function paidFields(payload, name, email) {
  const fields = {
    "Coach Name": name,
    "Contact Me": email,
    "Coach title": clip(payload.title, 200),
    "About Me & My Practice": clip(payload.bio, 4000),
    "Tell us about your ideal client": idealClient(payload),
    "Visit My Website!": clip(payload.website, 400),
    "Scheduler URL": clip(payload.cal, 400),
  };
  const price = parseInt(clip(payload.price, 6), 10);
  if (price > 0 && price < 10000) fields["Price per Session"] = price;
  return safeFields(fields);
}

async function airtable(token, url, options) {
  const headers = { Authorization: "Bearer " + token };
  if (options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method: options.method,
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(function () { return {}; });
  return { ok: res.ok, status: res.status, data: data };
}

async function saveCoach(payload, name, email) {
  const token = airtableToken();
  if (!token) return { ok: false, status: 503, error: "not_configured" };
  const paid = isPaidSignup(payload);
  if ((payload.plan === "monthly" || payload.plan === "annual") && !paid) {
    return { ok: true, awaitingPayment: true };
  }
  const table = paid ? PAID_TABLE : FREE_TABLE;
  const emailField = paid ? "Contact Me" : "Coach Email";
  const formula = "LOWER({" + emailField + "})='" + email.replace(/'/g, "\\'") + "'";
  const findUrl = "https://api.airtable.com/v0/" + PROFILE_BASE + "/" + table +
    "?maxRecords=1&filterByFormula=" + encodeURIComponent(formula);
  const found = await airtable(token, findUrl, { method: "GET" });
  if (!found.ok) {
    console.log("coach-join airtable find", found.status);
    return { ok: false, status: 502, error: "save_failed" };
  }
  const existing = found.data.records && found.data.records[0];
  const current = existing && existing.fields;
  if (paid && current && (current["JH Member?"] === true || current["Approved?"] === true || current["Send Confirmation"] === true)) {
    return { ok: true, existingMember: true, table: "paid" };
  }
  const fields = paid ? paidFields(payload, name, email) : freeFields(payload, name, email);
  const recordUrl = "https://api.airtable.com/v0/" + PROFILE_BASE + "/" + table +
    (existing ? "/" + encodeURIComponent(existing.id) : "");
  const saved = await airtable(token, recordUrl, {
    method: existing ? "PATCH" : "POST",
    body: { fields: fields, typecast: false },
  });
  if (!saved.ok) {
    console.log("coach-join airtable save", saved.status, paid ? "paid" : "free");
    return { ok: false, status: 502, error: "save_failed" };
  }
  return { ok: true, existingMember: false, table: paid ? "paid" : "free" };
}

async function outseta(auth, path, body) {
  const res = await fetch("https://" + DOMAIN + path, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(function () { return {}; });
  return { ok: res.ok, status: res.status, data: data };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: headers(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const email = clip(payload.email, 200).toLowerCase();
  const name = clip(payload.name, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2 || payload.agree !== true) {
    return json(400, { ok: false, error: "invalid_signup" });
  }

  let saved;
  try {
    saved = await saveCoach(payload, name, email);
  } catch (err) {
    console.log("coach-join blocked", err && err.field ? "field" : "save");
    return json(500, { ok: false, error: "save_failed" });
  }
  if (!saved.ok) return json(saved.status || 502, { ok: false, error: saved.error || "save_failed" });
  if (saved.awaitingPayment) return json(200, { ok: true, awaitingPayment: true, welcomeSent: false });
  if (saved.existingMember) return json(200, { ok: true, existingMember: true, welcomeSent: false });

  const auth = authHeader();
  if (!auth) return json(200, { ok: true, welcomeSent: false });

  const parts = name.split(/\s+/);
  const person = { Email: email, FirstName: parts[0] };
  if (parts.length > 1) person.LastName = parts.slice(1).join(" ");
  const title = clip(payload.title, 100);
  if (title) person.Title = title;

  const subscription = await outseta(auth, "/api/v1/email/lists/" + LIST_UID + "/subscriptions", {
    EmailList: { Uid: LIST_UID },
    Person: person,
    SendWelcomeEmail: payload.sendWelcome !== false,
    Source: "coach-halo.com/join",
    ConfirmationNotes: profileText(payload).slice(0, 500),
  });

  if (!subscription.ok) {
    console.log("coach-join subscribe status", subscription.status);
    return json(200, { ok: true, welcomeSent: false });
  }

  const personUid = subscription.data && subscription.data.Person && subscription.data.Person.Uid;
  let profileSaved = false;
  if (personUid) {
    const note = await outseta(auth, "/api/v1/activities/customactivity", {
      Title: "Coach-Halo signup",
      Description: profileText(payload),
      ActivityType: 50,
      EntityType: 2,
      EntityUid: personUid,
    });
    profileSaved = note.ok;
    if (!note.ok) console.log("coach-join note status", note.status);
  }

  return json(200, { ok: true, profileSaved: profileSaved, welcomeSent: true });
};
