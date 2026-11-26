/**
 * Partner network helpers shared by partner-submit and partner-activation.
 * Referral Status lives on the coach table: blank/Inactive, Pending, Active.
 * Only Joaquin sets Active (by hand, in Airtable). These functions set Pending
 * and stamp Activation Email Sent At.
 */

const lib = require("./coach-signup-lib");

const PLATFORMS = {
  mentorcruise: { label: "MentorCruise", hosts: ["mentorcruise.com"], attribution: false, check: "Confirm an approved, active MentorCruise mentor profile. No paid plan or attribution needed." },
  coachful: { label: "Coachful", hosts: ["coachful.co"], attribution: true, check: "Confirm in the Coachful affiliate dashboard that the account is attributed to Coach-Halo and on an active paid plan. A paid plan alone doesn't qualify." },
  paperbell: { label: "Paperbell", hosts: ["paperbell.com", "paperbell.me"], attribution: true, check: "Confirm in the Paperbell affiliate dashboard that the account is attributed to Coach-Halo and on an active paid plan. A paid plan alone doesn't qualify." },
  simplycoach: { label: "Simply.Coach", hosts: ["simply.coach"], attribution: true, check: "Confirm in the Simply.Coach affiliate dashboard that the account is attributed to Coach-Halo and on an active paid plan. A paid plan alone doesn't qualify." },
};
const VIA_LINK = { yes: "Yes", no: "No", unsure: "Not sure" };
const INDEPENDENT = "Independent";

const F = {
  email: "Coach Email",
  name: "Coach Name",
  status: "Referral Status",
  platform: "Partner Platform",
  profileUrl: "Partner Profile URL",
  viaLink: "Signed Up Via Coach-Halo Link",
  platformEmail: "Partner Account Email",
  website: "Website",
  affiliateUrl: "Affiliate Program URL",
  commission: "Affiliate Commission",
  submittedAt: "Partner Submitted At",
  lastSubmission: "Partner Last Submission",
  verifiedDate: "Verified Date",
  activationSentAt: "Activation Email Sent At",
  intakeComplete: "Intake Complete",
};

function formulaString(value) {
  return "'" + String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

function normalizeUrl(raw) {
  let v = lib.clip(raw, 400);
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  if (!/^https?:\/\/[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i.test(v)) return "";
  return v;
}

function hostMatches(url, hosts) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return hosts.some(function (h) { return host === h || host.endsWith("." + h); });
  } catch (err) {
    return false;
  }
}

function tableUrl(suffix) {
  return "https://api.airtable.com/v0/" + lib.PROFILE_BASE + "/" + lib.coachTable() + (suffix || "");
}

async function findCoach(email) {
  const formula = "LOWER({" + F.email + "})=" + formulaString(email.toLowerCase());
  const found = await lib.airtable(lib.airtableToken(), tableUrl("?maxRecords=2&filterByFormula=" + encodeURIComponent(formula)), { method: "GET" });
  if (!found.ok) {
    const err = new Error("lookup_failed");
    err.status = 502;
    throw err;
  }
  return (found.data.records && found.data.records[0]) || null;
}

async function writeCoach(recordId, fields) {
  const res = await lib.airtable(lib.airtableToken(), tableUrl(recordId ? "/" + encodeURIComponent(recordId) : ""), {
    method: recordId ? "PATCH" : "POST",
    body: { fields: fields, typecast: false },
  });
  if (!res.ok) console.log("partner airtable write", res.status, res.data && res.data.error && res.data.error.type);
  return res;
}

function statusOf(record) {
  const v = record && record.fields && record.fields[F.status];
  return typeof v === "string" && v ? v : "Inactive";
}

function activationCopy() {
  return {
    subject: "You're all set! Your Coach-Halo referrals are now active",
    label: "REFERRALS ACTIVE",
    preheader: "We've verified your partner profile and activated your Coach-Halo referrals.",
    body: lib.mailP("Great news! We've verified your partner profile and activated your Coach-Halo referrals.") +
      lib.mailP("From now on, whenever we find a lead that matches your ideal client, we'll automatically reach out and direct them to your coaching profile or website.") +
      lib.mailP("No additional action is needed on your end.") +
      lib.mailP("We're excited to help your coaching business grow!") +
      lib.mailP("Happy coaching,", true),
  };
}

function activationText(first) {
  return [
    "Hi Coach " + first + ",",
    "",
    "Great news! We've verified your partner profile and activated your Coach-Halo referrals.",
    "",
    "From now on, whenever we find a lead that matches your ideal client, we'll automatically reach out and direct them to your coaching profile or website.",
    "",
    "No additional action is needed on your end.",
    "",
    "We're excited to help your coaching business grow!",
    "",
    "Happy coaching,",
    "Joaquin",
    "Founder, Coach-Halo",
  ].join("\n");
}

function activationEmail(coachName, email) {
  const raw = lib.firstName(coachName);
  const first = raw === "there" ? "" : raw;
  const greeting = first ? "Hi Coach " + lib.escapeHtml(first) + "," : "Hi Coach,";
  return {
    to: email,
    subject: activationCopy().subject,
    html: lib.brandedHtml(activationCopy(), greeting, email),
    text: activationText(first).replace("Hi Coach ,", "Hi Coach,"),
    category: "ch_partner_activation",
    track: false,
  };
}

module.exports = {
  PLATFORMS: PLATFORMS,
  INDEPENDENT: INDEPENDENT,
  VIA_LINK: VIA_LINK,
  F: F,
  normalizeUrl: normalizeUrl,
  hostMatches: hostMatches,
  tableUrl: tableUrl,
  findCoach: findCoach,
  writeCoach: writeCoach,
  statusOf: statusOf,
  activationEmail: activationEmail,
};
