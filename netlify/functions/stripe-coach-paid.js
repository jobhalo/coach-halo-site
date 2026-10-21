/**
 * Stripe webhook for coach-halo.com paid signup.
 * Writes the paid profile only after checkout.session.completed
 * or checkout.session.async_payment_succeeded, when payment_status is paid,
 * the amount is $35 or $300, and the checkout reference matches the held profile.
 *
 * Env: STRIPE_WEBHOOK_SECRET, AIRTABLE_TOKEN (or AIRTABLE_PAT).
 * Never writes JH Member?, Approved?, Send Confirmation, or Ship?.
 */

const lib = require("./coach-signup-lib");

const FULFILL = {
  "checkout.session.completed": true,
  "checkout.session.async_payment_succeeded": true,
};

function json(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return json(405, { received: false });
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    console.log("stripe-coach-paid missing secret");
    return json(500, { received: false });
  }
  const raw = lib.rawBody(event);
  const header = (event.headers && (event.headers["stripe-signature"] || event.headers["Stripe-Signature"])) || "";
  if (!lib.verifyStripeSignature(raw, header, secret)) {
    return json(400, { received: false });
  }
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch (err) {
    return json(400, { received: false });
  }
  if (!FULFILL[evt.type]) return json(200, { received: true });
  let store;
  try {
    store = lib.productionStore(event);
  } catch (err) {
    console.log("stripe-coach-paid store unavailable");
    return json(500, { received: false });
  }
  let result;
  try {
    result = await lib.fulfillPaidCheckout(store, evt.data && evt.data.object);
  } catch (err) {
    console.log("stripe-coach-paid fulfill failed");
    return json(500, { received: false });
  }
  if (!result.ok) return json(result.status || 500, { received: false });
  return json(200, { received: true });
};
