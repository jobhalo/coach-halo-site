/**
 * Coach signup from coach-halo.com/join/.
 * Free signup writes the free-coach table and can send the free welcome.
 * Paid signup only stores a short-lived hold and returns a checkout reference.
 * Stripe's webhook writes the paid profile after payment.
 *
 * Never writes JH Member?, Approved?, Send Confirmation, or Ship?.
 * paidConfirmed from the browser is ignored.
 *
 * Env: AIRTABLE_TOKEN (or AIRTABLE_PAT),
 *      OUTSETA_API_KEY and OUTSETA_API_SECRET.
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

  const signup = lib.cleanSignup(payload);
  if (!lib.validEmail(signup.email) || signup.name.length < 2 || signup.agree !== true) {
    return json(400, { ok: false, error: "invalid_signup" });
  }

  if (payload.holdForPayment === true) {
    let held;
    try {
      held = await lib.holdProfile(lib.productionStore(event), signup);
    } catch (err) {
      console.log("coach-join hold failed");
      return json(503, { ok: false, error: "not_configured" });
    }
    if (!held.ok) return json(held.status || 400, { ok: false, error: held.error || "invalid_signup" });
    return json(200, { ok: true, checkoutRef: held.checkoutRef, welcomeSent: false });
  }

  let saved;
  try {
    saved = await lib.saveCoach(signup, signup.name, signup.email);
  } catch (err) {
    console.log("coach-join blocked", err && err.field ? "field" : "save");
    return json(500, { ok: false, error: "save_failed" });
  }
  if (!saved.ok) return json(saved.status || 502, { ok: false, error: saved.error || "save_failed" });
  if (saved.awaitingPayment) return json(200, { ok: true, awaitingPayment: true, welcomeSent: false });
  if (saved.existingMember) return json(200, { ok: true, existingMember: true, welcomeSent: false });
  if (saved.table === "paid") return json(200, { ok: true, welcomeSent: false });

  const welcome = await lib.sendFreeWelcome(signup, signup.name, signup.email);
  return json(200, Object.assign({ ok: true }, welcome));
};
