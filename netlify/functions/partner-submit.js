/**
 * Partner network submissions from coach-halo.com/partners/.
 *
 * kind "profile":   coach is on MentorCruise, Coachful, Paperbell, or Simply.Coach.
 * kind "affiliate": coach runs an independent affiliate program on their own site.
 *
 * Upserts the coach row by email and sets Referral Status to Pending.
 * An Active row is never changed except Partner Last Submission; Joaquin
 * gets an email to review it. Unknown emails get a minimal Pending row with
 * Account Type left blank, so they cannot enter lead matching until the
 * intake is done and the row is verified.
 *
 * Env: same as coach-join (AIRTABLE_TOKEN, SENDGRID_API_KEY, COACH_HALO_ENV,
 *      COACH_TABLE_ID and EMAIL_REDIRECT_TO outside production).
 */

const lib = require("./coach-signup-lib");
const partner = require("./partner-lib");
const guard = require("./signup-guard");

const F = partner.F;

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

function cleanSubmission(payload) {
  const kind = payload.kind === "affiliate" ? "affiliate" : payload.kind === "profile" ? "profile" : "";
  const email = lib.clip(payload.email, 200).toLowerCase();
  if (kind === "profile") {
    const key = String(payload.platform || "").toLowerCase().replace(/[^a-z]/g, "");
    const platform = partner.PLATFORMS[key];
    const attribution = !!(platform && platform.attribution);
    return {
      kind: kind,
      email: email,
      platformKey: platform ? key : "",
      platform: platform ? platform.label : "",
      attribution: attribution,
      profileUrl: partner.normalizeUrl(payload.profileUrl),
      rawProfileUrl: lib.clip(payload.profileUrl, 400),
      viaLink: attribution ? partner.VIA_LINK[String(payload.viaLink || "").toLowerCase()] || "" : "",
      platformEmail: attribution ? lib.clip(payload.platformEmail, 200).toLowerCase() : "",
    };
  }
  return {
    kind: kind,
    email: email,
    platform: kind ? partner.INDEPENDENT : "",
    website: partner.normalizeUrl(payload.website),
    affiliateUrl: partner.normalizeUrl(payload.affiliateUrl),
    commission: lib.clip(payload.commission, 200),
    rawWebsite: lib.clip(payload.website, 400),
    rawAffiliateUrl: lib.clip(payload.affiliateUrl, 400),
  };
}

function invalidReason(sub) {
  if (!sub.kind) return "invalid_kind";
  if (!lib.validEmail(sub.email) || guard.jhSignupEmailProblem(sub.email)) return "invalid_email";
  if (sub.kind === "profile") {
    if (!sub.platform) return "invalid_platform";
    if (!sub.profileUrl) return "invalid_profile_url";
    if (sub.attribution && !sub.viaLink) return "invalid_via_link";
    if (sub.platformEmail && !lib.validEmail(sub.platformEmail)) return "invalid_platform_email";
    return "";
  }
  if (!sub.website) return "invalid_website";
  if (!sub.affiliateUrl) return "invalid_affiliate_url";
  if (!sub.commission) return "invalid_commission";
  return "";
}

function submissionFields(sub) {
  if (sub.kind === "profile") {
    return {
      [F.platform]: sub.platform,
      [F.profileUrl]: sub.profileUrl,
      [F.viaLink]: sub.viaLink || null,
      [F.platformEmail]: sub.platformEmail || null,
    };
  }
  return {
    [F.platform]: partner.INDEPENDENT,
    [F.website]: sub.website,
    [F.affiliateUrl]: sub.affiliateUrl,
    [F.commission]: sub.commission,
  };
}

function submissionSummary(sub, now) {
  const lines = [now + " " + (sub.kind === "profile" ? "Partner profile" : "Independent affiliate program")];
  if (sub.kind === "profile") {
    lines.push("Platform: " + sub.platform, "Profile URL: " + sub.profileUrl);
    if (sub.viaLink) lines.push("Signed up via Coach-Halo link: " + sub.viaLink);
    if (sub.platformEmail) lines.push("Platform account email: " + sub.platformEmail);
  } else {
    lines.push("Website: " + sub.website, "Affiliate URL: " + sub.affiliateUrl, "Commission: " + sub.commission);
  }
  return lines.join("\n");
}

function domainNote(sub) {
  if (sub.kind !== "profile") return "";
  const platform = partner.PLATFORMS[sub.platformKey];
  return partner.hostMatches(sub.profileUrl, platform.hosts)
    ? "Matches " + platform.label
    : "Check: URL is not on " + platform.hosts.join(" / ");
}

async function notifyAdmin(sub, ctx) {
  if (lib.isSignupTest(sub.email)) return;
  const name = ctx.name || sub.email;
  let subject;
  let intro;
  if (ctx.priorStatus === "Active") {
    subject = "Active partner re-submitted: " + name;
    intro = "An <strong>Active</strong> coach submitted new partner info. Nothing was changed except Partner Last Submission. Update the row by hand if the new info should replace the old.";
  } else if (sub.kind === "profile") {
    subject = "Partner verification needed: " + name + " (" + sub.platform + ")";
    intro = "Referral Status is now <strong>Pending</strong>. " + lib.escapeHtml(partner.PLATFORMS[sub.platformKey].check) +
      (sub.attribution && sub.viaLink !== "Yes" ? " <strong>The coach did not confirm signing up through a Coach-Halo link: likely an existing account. Review case by case.</strong>" : "") +
      " Then set Referral Status to Active; the activation email sends automatically.";
  } else {
    subject = "Affiliate program review needed: " + name;
    intro = "Referral Status is now <strong>Pending</strong>. Review the independent affiliate program individually, then set Referral Status to Active; the activation email sends automatically.";
  }
  const rows = [
    lib.adminRow("Name", ctx.name),
    lib.adminRow("Email", sub.email),
    lib.adminRow("Submission", sub.kind === "profile" ? "Partner profile" : "Independent affiliate program"),
    lib.adminRow("Platform", sub.platform),
    lib.adminRow("Profile URL", sub.profileUrl),
    lib.adminRow("Domain check", domainNote(sub)),
    lib.adminRow("Signed up via Coach-Halo link", sub.viaLink),
    lib.adminRow("Platform account email", sub.platformEmail),
    lib.adminRow("Website", sub.website),
    lib.adminRow("Affiliate URL", sub.affiliateUrl),
    lib.adminRow("Commission", sub.commission),
    lib.adminRow("Previous status", ctx.priorStatus),
    lib.adminRow("Intake", ctx.intakeComplete ? "Complete" : ctx.created ? "Incomplete: new row from this form, no /join intake yet (Account Type blank)" : "Incomplete: ideal client or other intake answers missing"),
    lib.adminRow("Airtable", lib.recordLink(ctx.recordId)),
  ];
  await lib.sendMail({
    to: lib.adminNotifyEmail(),
    fromName: "Coach-Halo Partners",
    subject: lib.clip(subject, 180),
    text: subject + "\n\n" + submissionSummary(sub, ctx.now) + "\n\nPrevious status: " + ctx.priorStatus + "\nAirtable: " + lib.recordLink(ctx.recordId),
    html: lib.adminTableHtml(intro, rows),
    category: "ch_admin_partner",
  });
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
  if (String(payload.company || "").trim()) {
    return json(200, { ok: true });
  }

  const sub = cleanSubmission(payload);
  const reason = invalidReason(sub);
  if (reason) return json(400, { ok: false, error: reason });

  const now = new Date().toISOString();
  let record;
  try {
    record = await partner.findCoach(sub.email);
  } catch (err) {
    console.log("partner-submit lookup", err && err.message);
    return json(err && err.status === 503 ? 503 : 502, { ok: false, error: "save_failed" });
  }

  const priorStatus = partner.statusOf(record);
  const name = record ? lib.clip([record.fields[F.name], record.fields["Coach Last Name"]].filter(Boolean).join(" "), 120) : "";
  let intakeComplete = !!(record && record.fields[F.intakeComplete]);
  let recordId = record ? record.id : "";
  let created = false;
  let res;

  if (priorStatus === "Active") {
    const previous = String(record.fields[F.lastSubmission] || "").trim();
    const entry = submissionSummary(sub, now);
    res = await partner.writeCoach(recordId, {
      [F.lastSubmission]: lib.clip(previous ? entry + "\n\n" + previous : entry, 20000),
    });
  } else {
    const fields = Object.assign(submissionFields(sub), {
      [F.status]: "Pending",
      [F.submittedAt]: now,
    });
    if (record) {
      res = await partner.writeCoach(recordId, fields);
    } else {
      Object.keys(fields).forEach(function (k) { if (fields[k] === null) delete fields[k]; });
      fields[F.email] = sub.email;
      res = await partner.writeCoach("", fields);
      created = true;
      intakeComplete = false;
      if (res.ok && res.data && res.data.id) recordId = res.data.id;
    }
  }
  if (!res.ok) return json(502, { ok: false, error: "save_failed" });

  try {
    await notifyAdmin(sub, { name: name, priorStatus: priorStatus, intakeComplete: intakeComplete, created: created, recordId: recordId, now: now });
  } catch (err) {
    console.log("partner-submit admin notify failed");
  }

  return json(200, { ok: true });
};
