/**
 * Scheduled every 10 minutes (netlify.toml).
 * Sends the "referrals are now active" email once per coach after Joaquin
 * sets Referral Status to Active.
 *
 * Activation Email Sent At is written before sending, so two overlapping runs
 * cannot both send. If the send fails it is cleared and the next run retries.
 * Clearing it by hand in Airtable re-sends the email.
 *
 * Env: same as coach-join.
 */

const lib = require("./coach-signup-lib");
const partner = require("./partner-lib");

const F = partner.F;
const BATCH = 20;

async function dueRecords() {
  const formula = "AND({" + F.status + "}='Active',{" + F.activationSentAt + "}=BLANK(),{" + F.email + "}!='')";
  const query = "?pageSize=" + BATCH + "&maxRecords=" + BATCH + "&filterByFormula=" + encodeURIComponent(formula);
  const res = await lib.airtable(lib.airtableToken(), partner.tableUrl(query), { method: "GET" });
  if (!res.ok) {
    console.log("partner-activation lookup", res.status);
    return [];
  }
  return res.data.records || [];
}

async function activate(record) {
  const fields = record.fields || {};
  const email = lib.clip(fields[F.email], 200).toLowerCase();
  if (!lib.validEmail(email)) return "skipped";

  const now = new Date().toISOString();
  const claim = { [F.activationSentAt]: now };
  if (!fields[F.verifiedDate]) claim[F.verifiedDate] = now.slice(0, 10);
  const claimed = await partner.writeCoach(record.id, claim);
  if (!claimed.ok) return "claim_failed";

  if (lib.isSignupTest(email)) return "test";

  let sent = { ok: false };
  try {
    sent = await lib.sendMail(partner.activationEmail(fields[F.name], email));
  } catch (err) {
    console.log("partner-activation send threw");
  }
  if (sent.ok) return "sent";

  await partner.writeCoach(record.id, { [F.activationSentAt]: null });
  return "send_failed";
}

exports.handler = async function () {
  let records;
  try {
    records = await dueRecords();
  } catch (err) {
    console.log("partner-activation not configured", err && err.message);
    return { statusCode: 200, body: "" };
  }
  const tally = {};
  for (const record of records) {
    const result = await activate(record);
    tally[result] = (tally[result] || 0) + 1;
  }
  if (records.length) console.log("partner-activation", JSON.stringify(tally));
  return { statusCode: 200, body: "" };
};
