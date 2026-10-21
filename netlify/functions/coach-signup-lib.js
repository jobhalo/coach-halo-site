/**
 * Free signup writes the free-coach table.
 * Paid signup stores the profile until Stripe confirms $35/month or $300/year,
 * then the webhook writes the paid profile table.
 *
 * Never writes JH Member?, Approved?, Send Confirmation, or Ship?.
 * The browser cannot set paidConfirmed. Only a verified Stripe event can.
 */

const crypto = require("crypto");

const LIST_UID = "7maRvjQE";
const DOMAIN = process.env.OUTSETA_DOMAIN || "job-halo.outseta.com";
const PROFILE_BASE = "apppbUQrzMKIHnPUl";
const FREE_TABLE = "tbldOPTV5xCkv23yc";
const PAID_TABLE = "tbl3FW3kF6KsQYi9c";
const HOLD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNATURE_TOLERANCE_SEC = 300;
const PLAN_CENTS = { monthly: 3500, annual: 30000 };

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

const FREE_TYPE = {
  career: "Career Coaching",
  life: "Life Coaching",
  financial: "Personal Financial Planning",
  relationship: "Relationship Coaching",
  business: "Business Coaching",
  wellness: "Health and Fitness Coaching",
};

function clip(value, max) {
  const text = String(value == null ? "" : value).trim();
  return text.length > max ? text.slice(0, max) : text;
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

function listValues(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) { return clip(item, 80); }).filter(Boolean).slice(0, 12);
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

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanSignup(payload) {
  const plan = payload.plan === "annual" ? "annual" : payload.plan === "monthly" ? "monthly" : "free";
  return {
    name: clip(payload.name, 120),
    email: clip(payload.email, 200).toLowerCase(),
    title: clip(payload.title, 200),
    website: clip(payload.website, 400),
    coachType: clip(payload.coachType, 40),
    offers: listValues(payload.offers),
    levels: listValues(payload.levels),
    industries: clip(payload.industries, 300),
    hasCal: clip(payload.hasCal, 20),
    cal: clip(payload.cal, 400),
    freecall: clip(payload.freecall, 20),
    price: clip(payload.price, 6),
    bio: clip(payload.bio, 4000),
    tz: clip(payload.tz, 80),
    langs: listValues(payload.langs),
    capacity: clip(payload.capacity, 20),
    heard: clip(payload.heard, 80),
    plan: plan,
    agree: payload.agree === true,
    paidTerms: payload.paidTerms === true,
    sendWelcome: payload.sendWelcome !== false,
  };
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
  ].filter(Boolean).join("\n").slice(0, 8000);
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

function airtableToken() {
  return String(process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT || "").trim();
}

function authHeader() {
  const raw = String(process.env.OUTSETA_API_KEY || "").trim();
  const secret = String(process.env.OUTSETA_API_SECRET || process.env.OUTSETA_SECRET_KEY || "").trim();
  const token = raw.includes(":") ? raw : secret ? raw + ":" + secret : "";
  if (!token || token.indexOf(":") < 1 || token.endsWith(":")) return "";
  return "Outseta " + token;
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
  const paid = payload.paidConfirmed === true && (payload.plan === "monthly" || payload.plan === "annual");
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
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(function () { return {}; });
  return { ok: res.ok, status: res.status, data: data };
}

async function sendFreeWelcome(payload, name, email) {
  const auth = authHeader();
  if (!auth) return { welcomeSent: false };
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
    return { welcomeSent: false };
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
  return { profileSaved: profileSaved, welcomeSent: true };
}

function memoryStore() {
  const map = new Map();
  return {
    get: function (key) { return Promise.resolve(map.has(key) ? map.get(key) : null); },
    set: function (key, value) { map.set(key, value); return Promise.resolve(); },
    delete: function (key) { map.delete(key); return Promise.resolve(); },
  };
}

function productionStore(event) {
  const blobs = require("@netlify/blobs");
  if (event) blobs.connectLambda(event);
  const store = blobs.getStore({ name: "coach-paid-holds", consistency: "strong" });
  return {
    get: function (key) { return store.get(key, { type: "json" }); },
    set: function (key, value) { return store.setJSON(key, value); },
    delete: function (key) { return store.delete(key); },
  };
}

async function holdProfile(store, payload) {
  const signup = cleanSignup(payload);
  if (!validEmail(signup.email) || signup.name.length < 2 || !signup.agree) {
    return { ok: false, status: 400, error: "invalid_signup" };
  }
  if (signup.plan !== "monthly" && signup.plan !== "annual") {
    return { ok: false, status: 400, error: "invalid_signup" };
  }
  if (!signup.paidTerms) return { ok: false, status: 400, error: "invalid_signup" };
  const id = "ch_" + crypto.randomBytes(16).toString("hex");
  await store.set(id, { signup: signup, createdAt: Date.now() });
  return { ok: true, checkoutRef: id };
}

function sessionEmail(session) {
  const details = session && session.customer_details;
  return clip((details && details.email) || session.customer_email || "", 200).toLowerCase();
}

async function fulfillPaidCheckout(store, session) {
  if (!session || session.livemode !== true) return { ok: true, ignored: "not_live" };
  if (session.payment_status !== "paid") return { ok: true, ignored: "unpaid" };
  const ref = clip(session.client_reference_id, 80);
  if (!/^ch_[a-f0-9]{32}$/.test(ref)) return { ok: true, ignored: "no_signup_ref" };
  const doneKey = "done:" + clip(session.id, 80);
  if (await store.get(doneKey)) return { ok: true, ignored: "already_saved" };
  const held = await store.get(ref);
  if (!held || !held.signup || Date.now() - held.createdAt > HOLD_TTL_MS) {
    console.log("coach-paid hold missing");
    return { ok: true, ignored: "hold_missing" };
  }
  const signup = held.signup;
  const paidEmail = sessionEmail(session);
  if (!paidEmail || paidEmail !== signup.email) {
    console.log("coach-paid email mismatch");
    return { ok: true, ignored: "email_mismatch" };
  }
  const expected = PLAN_CENTS[signup.plan];
  const currency = clip(session.currency, 8).toLowerCase();
  if (currency !== "usd" || session.amount_total !== expected) {
    console.log("coach-paid amount mismatch");
    return { ok: true, ignored: "amount_mismatch" };
  }
  const payload = Object.assign({}, signup, { paidConfirmed: true, plan: signup.plan });
  const saved = await saveCoach(payload, signup.name, signup.email);
  if (!saved.ok) return saved;
  await store.set(doneKey, { at: Date.now() });
  await store.delete(ref);
  return { ok: true, saved: true, table: "paid" };
}

function verifyStripeSignature(rawBody, header, secret) {
  if (!rawBody || !header || !secret) return false;
  const parts = String(header).split(",");
  let timestamp = "";
  const signatures = [];
  parts.forEach(function (part) {
    const eq = part.indexOf("=");
    if (eq < 1) return;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  });
  const t = Number(timestamp);
  if (!timestamp || !signatures.length || !Number.isFinite(t)) return false;
  if (Math.abs(Date.now() / 1000 - t) > SIGNATURE_TOLERANCE_SEC) return false;
  const expected = crypto.createHmac("sha256", secret).update(timestamp + "." + rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  return signatures.some(function (sig) {
    const buf = Buffer.from(sig);
    return buf.length === expectedBuf.length && crypto.timingSafeEqual(buf, expectedBuf);
  });
}

function rawBody(event) {
  const body = event.body || "";
  if (event.isBase64Encoded) return Buffer.from(body, "base64").toString("utf8");
  return body;
}

module.exports = {
  PLAN_CENTS: PLAN_CENTS,
  cleanSignup: cleanSignup,
  saveCoach: saveCoach,
  sendFreeWelcome: sendFreeWelcome,
  memoryStore: memoryStore,
  productionStore: productionStore,
  holdProfile: holdProfile,
  fulfillPaidCheckout: fulfillPaidCheckout,
  verifyStripeSignature: verifyStripeSignature,
  rawBody: rawBody,
  validEmail: validEmail,
};
