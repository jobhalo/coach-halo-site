/**
 * Coach signup from coach-halo.com/join/.
 * Subscribes the coach to Outseta list Coach-Halo Subscribers (7maRvjQE)
 * and stores their answers as a note on that person.
 *
 * Env: OUTSETA_API_KEY and OUTSETA_API_SECRET
 * (or OUTSETA_API_KEY already set to "key:secret").
 */

const LIST_UID = "7maRvjQE";
const DOMAIN = process.env.OUTSETA_DOMAIN || "job-halo.outseta.com";

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

  const auth = authHeader();
  if (!auth) return json(503, { ok: false, error: "not_configured" });

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
    return json(502, { ok: false, error: "subscribe_failed" });
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

  return json(200, { ok: true, profileSaved: profileSaved });
};
