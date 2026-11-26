/**
 * Coach signup from coach-halo.com/join/.
 * Writes the coach table (upsert by email), then sends the admin
 * notification and the welcome email. Referral eligibility is never set here.
 *
 * Never writes JH Member?, Approved?, Send Confirmation, Ship?, or Referral Status.
 * paidConfirmed and holdForPayment from the browser are ignored; the legacy
 * paid checkout is no longer offered.
 *
 * Env: AIRTABLE_TOKEN (or AIRTABLE_PAT), SENDGRID_API_KEY, COACH_HALO_ENV,
 *      COACH_TABLE_ID and EMAIL_REDIRECT_TO outside production,
 *      OUTSETA_API_KEY and OUTSETA_API_SECRET (production only).
 */

const lib = require("./coach-signup-lib");

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
  delete payload.paidConfirmed;
  delete payload.holdForPayment;
  delete payload.photo;
  delete payload.photoKey;
  payload.plan = "free";

  const signup = lib.cleanSignup(payload);
  if (!lib.validEmail(signup.email) || signup.name.length < 2 || signup.agree !== true) {
    return json(400, { ok: false, error: "invalid_signup" });
  }
  if (!lib.intakeComplete(signup)) {
    return json(400, { ok: false, error: "incomplete_signup" });
  }

  let saved;
  try {
    saved = await lib.saveCoach(signup, signup.name, signup.email);
  } catch (err) {
    console.log("coach-join blocked", err && err.field ? "field" : err && err.message === "staging_table_missing" ? "staging_table" : "save");
    return json(500, { ok: false, error: "save_failed" });
  }
  if (!saved.ok) return json(saved.status || 502, { ok: false, error: saved.error || "save_failed" });
  if (lib.isSignupTest(signup.email)) return json(200, { ok: true, welcomeSent: false });

  try { await lib.sendAdminSignupNotify(signup, "free"); } catch (err) { console.log("coach-join admin notify failed"); }
  const welcome = await lib.sendFreeWelcome(signup, signup.name, signup.email);
  return json(200, Object.assign({ ok: true }, welcome));
};
