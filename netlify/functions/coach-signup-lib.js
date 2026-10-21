/**
 * Free signup writes the free-coach table.
 * Paid signup stores the profile until Stripe confirms $35/month or $300/year,
 * then the webhook writes the paid profile table.
 *
 * Never writes JH Member?, Approved?, Send Confirmation, or Ship?.
 * The browser cannot set paidConfirmed. Only a verified Stripe event can.
 */

const crypto = require("crypto");

const FREE_LIST_UID = "7maRvjQE";
const PAID_LIST_UID = "aWxRZbQV";
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

async function outsetaGet(path) {
  const auth = authHeader();
  if (!auth) return { ok: false, status: 503, data: {} };
  const res = await fetch("https://" + DOMAIN + path, { headers: { Authorization: auth } });
  const data = await res.json().catch(function () { return {}; });
  return { ok: res.ok, status: res.status, data: data };
}

async function findPerson(email) {
  const found = await outsetaGet("/api/v1/crm/people?q=" + encodeURIComponent(email) + "&limit=10");
  const items = (found.data && found.data.items) || [];
  return items.find(function (person) {
    return String(person.Email || "").toLowerCase() === email;
  }) || null;
}

async function findOrCreatePerson(signup) {
  const existing = await findPerson(signup.email);
  if (existing && existing.Uid) return existing.Uid;
  const auth = authHeader();
  if (!auth) return "";
  const parts = signup.name.split(/\s+/);
  const person = { Email: signup.email, FirstName: parts[0] };
  if (parts.length > 1) person.LastName = parts.slice(1).join(" ");
  const created = await outseta(auth, "/api/v1/crm/people", person);
  if (created.ok && created.data && created.data.Uid) return created.data.Uid;
  const again = await findPerson(signup.email);
  return again && again.Uid ? again.Uid : "";
}

async function personActivities(uid) {
  const found = await outsetaGet("/api/v1/activities?EntityType=2&EntityUid=" + encodeURIComponent(uid) + "&limit=20");
  return (found.data && found.data.items) || [];
}

async function holdForCheckout(payload) {
  const signup = cleanSignup(payload);
  if (!validEmail(signup.email) || signup.name.length < 2 || !signup.agree) {
    return { ok: false, status: 400, error: "invalid_signup" };
  }
  if (signup.plan !== "monthly" && signup.plan !== "annual") {
    return { ok: false, status: 400, error: "invalid_signup" };
  }
  const uid = await findOrCreatePerson(signup);
  if (!uid) return { ok: false, status: 503, error: "not_configured" };
  const auth = authHeader();
  const noted = await outseta(auth, "/api/v1/activities/customactivity", {
    Title: "coach-paid-hold",
    Description: JSON.stringify({ signup: signup, createdAt: Date.now() }).slice(0, 7000),
    ActivityType: 50,
    EntityType: 2,
    EntityUid: uid,
  });
  if (!noted.ok) {
    console.log("coach-join hold note", noted.status);
    return { ok: false, status: 502, error: "save_failed" };
  }
  return { ok: true, checkoutRef: "oh_" + uid };
}

async function loadOutsetaHold(ref) {
  const uid = ref.slice(3);
  const items = await personActivities(uid);
  const holds = items.filter(function (item) { return item.Title === "coach-paid-hold" && item.Description; });
  holds.sort(function (a, b) { return String(b.Created || "").localeCompare(String(a.Created || "")); });
  const latest = holds[0];
  if (!latest) return null;
  try {
    const raw = String(latest.Description).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    const parsed = JSON.parse(raw);
    return parsed && parsed.signup ? parsed : null;
  } catch (err) {
    return null;
  }
}

async function outsetaDone(ref, sessionId) {
  const items = await personActivities(ref.slice(3));
  return items.some(function (item) {
    return item.Title === "coach-paid-done" && item.Description === sessionId;
  });
}

async function markOutsetaDone(ref, sessionId) {
  const auth = authHeader();
  if (!auth) return;
  await outseta(auth, "/api/v1/activities/customactivity", {
    Title: "coach-paid-done",
    Description: clip(sessionId, 80),
    ActivityType: 50,
    EntityType: 2,
    EntityUid: ref.slice(3),
  });
}

async function sendListWelcome(listUid, payload, name, email) {
  const auth = authHeader();
  if (!auth) return { welcomeSent: false };
  const parts = name.split(/\s+/);
  const person = { Email: email, FirstName: parts[0] };
  if (parts.length > 1) person.LastName = parts.slice(1).join(" ");
  const title = clip(payload.title, 100);
  if (title) person.Title = title;
  const subscription = await outseta(auth, "/api/v1/email/lists/" + listUid + "/subscriptions", {
    EmailList: { Uid: listUid },
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

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function firstName(name) {
  const part = clip(name, 80).split(/\s+/).filter(Boolean)[0];
  return part || "there";
}

function mailP(html, last) {
  return '<p style="margin:0 0 ' + (last ? "0" : "16px") + ';font-size:15px;line-height:24px;color:#535353;">' + html + "</p>";
}

function mailH(text) {
  return '<p style="margin:8px 0 8px;font-size:15px;line-height:24px;color:#0a0a0a;font-weight:bold;">' + text + "</p>";
}

function welcomeCopy(kind) {
  if (kind === "paid") {
    return {
      subject: "You're in — welcome to Coach-Halo",
      label: "WELCOME",
      preheader: "You're in the Coach-Halo network. Lead previews will come to this inbox.",
      body: mailP("Thanks for signing up. You're in the Coach-Halo network.") +
        mailP("Starting today, you'll receive notifications when people explore coaching support and their needs align with your expertise and ideal client profile. These may be individuals seeking guidance across career, life, business, finances, and more.") +
        mailP("When there's a strong fit, Coach-Halo helps surface coach profiles to create warm introductions rather than cold outreach.") +
        mailP("One quick favor: move this email to your Primary inbox, or mark it as Not Spam, so future notifications land where they should.") +
        mailP("Welcome aboard. Let's help more people grow, in their careers and in life.", true),
    };
  }
  return {
    subject: "Welcome to the Coach-Halo free network",
    label: "WELCOME",
    preheader: "You're in the Coach-Halo free network. Alerts will come to this inbox.",
    body: mailP("Welcome to the Coach-Halo free network! 🎉") +
      mailP("You'll receive email alerts when we find coaching opportunities that could fit your specialty and ideal clients. Each alert will explain the opportunity and how to pursue it.") +
      mailH("What does free mean?") +
      mailP("There's no Coach-Halo subscription fee for these alerts. Some opportunities link to marketplaces like Bark or Thumbtack, which may charge you to contact the lead. Alerts depend on fit and availability.") +
      mailP("If paid enrollment is currently closed for your specialty, we'll let you know when it opens.") +
      mailH("Keep us in your inbox 📬") +
      mailP('Add <a href="mailto:joaquinh@coach-halo.com" style="color:#0a0a0a;text-decoration:underline;">joaquinh@coach-halo.com</a> to your contacts. If this email lands in Promotions, move it to Primary. If it lands in Spam, mark it as “Not spam.”') +
      mailP("Glad to have you here! Questions? Just reply.", true),
  };
}

function welcomeHtml(name, email, kind) {
  const copy = welcomeCopy(kind === "paid" ? "paid" : "free");
  const first = escapeHtml(firstName(name));
  const unsub = "https://airtable.com/apppbUQrzMKIHnPUl/pagXojKMMsO6ThuWB/form?prefill_Your%20Email%20(Required)=" + encodeURIComponent(email);
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>' + escapeHtml(copy.subject) + '</title></head>' +
    '<body style="margin:0;padding:0;width:100%;background-color:#fafafa;font-family:Arial,Helvetica,sans-serif;color:#0a0a0a;">' +
    '<div style="display:none;font-size:1px;color:#fafafa;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">' + escapeHtml(copy.preheader) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fafafa"><tr><td align="center" style="padding:36px 16px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;border:1px solid #e8e8e8;">' +
    '<tr><td style="padding:27px 36px;border-top:3px solid #0a0a0a;border-bottom:1px solid #e8e8e8;">' +
    '<table role="presentation" width="100%"><tr><td><a href="https://coach-halo.com" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;letter-spacing:2.8px;color:#0a0a0a;text-decoration:none;">COACH-HALO</a></td>' +
    '<td align="right" style="font-size:11px;letter-spacing:1.5px;color:#6b6b6b;">' + escapeHtml(copy.label) + '</td></tr></table></td></tr>' +
    '<tr><td style="padding:30px 36px 8px;">' +
    '<p style="margin:0 0 16px;font-size:16px;line-height:25px;color:#0a0a0a;">Hey ' + first + ',</p>' +
    copy.body +
    '</td></tr>' +
    '<tr><td style="padding:28px 36px 30px;"><p style="margin:0;font-size:14px;line-height:22px;color:#0a0a0a;">Joaquin<br><span style="font-size:12px;color:#6b6b6b;">Founder, Coach-Halo</span></p></td></tr>' +
    '<tr><td style="padding:20px 36px;border-top:1px solid #e8e8e8;"><a href="' + escapeHtml(unsub) + '" style="font-size:12px;line-height:20px;color:#6b6b6b;text-decoration:underline;">Unsubscribe</a></td></tr>' +
    '</table>' +
    '<table role="presentation" width="100%" style="max-width:600px;"><tr><td align="center" style="padding:19px 20px 0;font-size:11px;line-height:18px;color:#6b6b6b;">You\'re receiving this because you signed up at <a href="https://coach-halo.com" style="color:#6b6b6b;text-decoration:underline;">coach-halo.com</a>.</td></tr></table>' +
    '</td></tr></table></body></html>';
}

async function welcomeAlreadySent(email, kind) {
  const person = await findPerson(email);
  if (!person || !person.Uid) return false;
  const found = await outsetaGet("/api/v1/activities?EntityType=2&EntityUid=" + encodeURIComponent(person.Uid) + "&limit=50");
  const items = (found.data && found.data.items) || [];
  return items.some(function (item) {
    return item.Title === "coach-welcome-sent" && item.Description === kind;
  });
}

async function markWelcomeSent(email, kind) {
  const auth = authHeader();
  const person = await findPerson(email);
  if (!auth || !person || !person.Uid) return;
  await outseta(auth, "/api/v1/activities/customactivity", {
    Title: "coach-welcome-sent",
    Description: kind,
    ActivityType: 50,
    EntityType: 2,
    EntityUid: person.Uid,
  });
}

async function sendBrandedWelcome(name, email, kind) {
  const apiKey = String(process.env.SENDGRID_API_KEY || "").trim();
  const fromAddr = String(process.env.SENDGRID_FROM_EMAIL || "joaquinh@coach-halo.com").trim();
  if (!apiKey.startsWith("SG.") || !fromAddr.toLowerCase().endsWith("@coach-halo.com") || !validEmail(email)) {
    console.log("coach-join welcome not configured");
    return { welcomeSent: false };
  }
  const letter = kind === "paid" ? "paid" : "free";
  const unsub = "https://airtable.com/apppbUQrzMKIHnPUl/pagXojKMMsO6ThuWB/form?prefill_Your%20Email%20(Required)=" + encodeURIComponent(email);
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: email }] }],
      from: { email: fromAddr, name: "Joaquin @ Coach-Halo" },
      reply_to: { email: fromAddr, name: "Joaquin @ Coach-Halo" },
      subject: welcomeCopy(letter).subject,
      content: [{ type: "text/html", value: welcomeHtml(name, email, letter) }],
      headers: {
        "List-Unsubscribe": "<" + unsub + ">",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      categories: ["ch_welcome"],
      tracking_settings: {
        click_tracking: { enable: true, enable_text: false },
        open_tracking: { enable: true },
      },
    }),
  });
  if (!res.ok) {
    console.log("coach-join welcome status", res.status);
    return { welcomeSent: false };
  }
  return { welcomeSent: true };
}

async function deliverWelcome(listUid, payload, name, email, force) {
  const kind = listUid === PAID_LIST_UID ? "paid" : "free";
  const listed = await sendListWelcome(listUid, Object.assign({}, payload, { sendWelcome: false }), name, email);
  if (!force && payload.sendWelcome === false) {
    return { profileSaved: listed.profileSaved === true, welcomeSent: false };
  }
  if (await welcomeAlreadySent(email, kind)) {
    return { profileSaved: listed.profileSaved === true, welcomeSent: true };
  }
  const sent = await sendBrandedWelcome(name, email, kind);
  if (sent.welcomeSent) await markWelcomeSent(email, kind);
  return { profileSaved: listed.profileSaved === true, welcomeSent: sent.welcomeSent === true };
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
  if (event && event.blobs) {
    try { blobs.connectLambda(event); } catch (err) { /* runtime context is enough */ }
  }
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
  const blobRef = /^ch_[a-f0-9]{32}$/.test(ref);
  const outsetaRef = /^oh_[A-Za-z0-9]{6,20}$/.test(ref);
  if (!blobRef && !outsetaRef) return { ok: true, ignored: "no_signup_ref" };
  const sessionId = clip(session.id, 80);
  if (outsetaRef) {
    if (await outsetaDone(ref, sessionId)) return { ok: true, ignored: "already_saved" };
  } else if (store && await store.get("done:" + sessionId)) {
    return { ok: true, ignored: "already_saved" };
  }
  const held = outsetaRef ? await loadOutsetaHold(ref) : store ? await store.get(ref) : null;
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
  let welcome = { welcomeSent: true };
  if (!saved.existingMember) {
    welcome = await deliverWelcome(PAID_LIST_UID, payload, signup.name, signup.email, true);
    if (!welcome.welcomeSent) return { ok: false, status: 502, error: "welcome_failed" };
  }
  if (outsetaRef) await markOutsetaDone(ref, sessionId);
  else if (store) {
    await store.set("done:" + sessionId, { at: Date.now() });
    await store.delete(ref);
  }
  return { ok: true, saved: true, table: "paid", welcomeSent: welcome.welcomeSent === true };
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
  sendFreeWelcome: function (payload, name, email) {
    return deliverWelcome(FREE_LIST_UID, payload, name, email);
  },
  memoryStore: memoryStore,
  productionStore: productionStore,
  holdProfile: holdProfile,
  holdForCheckout: holdForCheckout,
  fulfillPaidCheckout: fulfillPaidCheckout,
  verifyStripeSignature: verifyStripeSignature,
  rawBody: rawBody,
  validEmail: validEmail,
};
