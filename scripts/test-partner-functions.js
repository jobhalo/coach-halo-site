// Local check of coach-join, partner-submit, and partner-activation against a fake Airtable/SendGrid.
// Run: node scripts/test-partner-functions.js
const assert = require("assert");

const rows = new Map();
let nextId = 1;
const mail = [];
let failSend = false;

function fakeFetch(url, opts) {
  opts = opts || {};
  const u = new URL(url);
  const respond = (status, data) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(data) });
  if (u.hostname === "api.sendgrid.com") {
    const body = JSON.parse(opts.body);
    if (failSend) return respond(500, {});
    mail.push({ to: body.personalizations[0].to[0].email, subject: body.subject, html: body.content.find((c) => c.type === "text/html").value });
    return respond(202, {});
  }
  if (u.hostname === "api.airtable.com") {
    const parts = u.pathname.split("/");
    assert.strictEqual(parts[3], "tblSTAGINGTEST001", "wrong table " + parts[3]);
    const id = parts[4];
    if (opts.method === "GET") {
      const f = u.searchParams.get("filterByFormula") || "";
      let list = [...rows.values()];
      const em = f.match(/LOWER\(\{Coach Email\}\)='([^']*)'/);
      if (em) list = list.filter((r) => String(r.fields["Coach Email"] || "").toLowerCase() === em[1]);
      if (f.includes("{Referral Status}='Active'")) list = list.filter((r) => r.fields["Referral Status"] === "Active" && !r.fields["Activation Email Sent At"]);
      return respond(200, { records: list.map((r) => ({ id: r.id, fields: Object.assign({}, r.fields) })) });
    }
    const body = JSON.parse(opts.body);
    if (opts.method === "POST") {
      const rec = { id: "rec" + nextId++, fields: body.fields };
      rows.set(rec.id, rec);
      return respond(200, rec);
    }
    const rec = rows.get(id);
    for (const [k, v] of Object.entries(body.fields)) {
      if (v === null) delete rec.fields[k]; else rec.fields[k] = v;
    }
    return respond(200, rec);
  }
  return respond(404, {});
}

async function main() {
  global.fetch = fakeFetch;
  process.env.AIRTABLE_TOKEN = "patTEST";
  process.env.SENDGRID_API_KEY = "SG.test";
  process.env.SENDGRID_FROM_EMAIL = "joaquinh@coach-halo.com";
  delete process.env.COACH_HALO_ENV;

  const join = require("../netlify/functions/coach-join");
  const submit = require("../netlify/functions/partner-submit");
  const activation = require("../netlify/functions/partner-activation");
  const post = (fn, body) => fn.handler({ httpMethod: "POST", body: JSON.stringify(body) });

  // No staging table configured: fail closed.
  delete process.env.COACH_TABLE_ID;
  let r = await post(submit, { kind: "profile", email: "a@coachmail.dev", platform: "mentorcruise", profileUrl: "mentorcruise.com/mentor/a" });
  assert.notStrictEqual(r.statusCode, 200, "should fail without staging table");
  process.env.COACH_TABLE_ID = "tblSTAGINGTEST001";

  // Production table refused outside production.
  process.env.COACH_TABLE_ID = "tbldOPTV5xCkv23yc";
  r = await post(submit, { kind: "profile", email: "a@coachmail.dev", platform: "mentorcruise", profileUrl: "mentorcruise.com/mentor/a" });
  assert.notStrictEqual(r.statusCode, 200, "should refuse production table in staging");
  process.env.COACH_TABLE_ID = "tblSTAGINGTEST001";

  // No redirect address: nothing is sent.
  delete process.env.EMAIL_REDIRECT_TO;
  const intake = {
    name: "Dana Coachwell", email: "dana@coachmail.dev", agree: true, coachType: "career",
    title: "Career coach for mid-career PMs", offers: ["Career change"], ideal: "Mid-career product managers moving into leadership roles.",
    website: "danacoach.com", plan: "monthly", holdForPayment: true,
  };
  r = await post(join, intake);
  assert.strictEqual(r.statusCode, 200, r.body);
  assert.strictEqual(mail.length, 0, "no mail without EMAIL_REDIRECT_TO");
  rows.clear();
  process.env.EMAIL_REDIRECT_TO = "joaquinh@coach-halo.com";

  // Ideal client required.
  r = await post(join, Object.assign({}, intake, { ideal: "short" }));
  assert.strictEqual(r.statusCode, 400);

  r = await post(join, intake);
  assert.strictEqual(r.statusCode, 200, r.body);
  const dana = [...rows.values()][0];
  assert.strictEqual(dana.fields["Intake Complete"], true);
  assert.ok(!("Referral Status" in dana.fields));
  assert.ok(mail.every((m) => m.to === "joaquinh@coach-halo.com" && m.subject.startsWith("[STAGING]")));
  assert.ok(mail.some((m) => m.subject.includes("New Coach-Halo signup: Dana Coachwell")));
  const welcome = mail.find((m) => m.subject.includes("Welcome to Coach-Halo"));
  assert.ok(welcome && welcome.html.includes("Explore Our Partner Network") && welcome.html.includes("Hey Dana,") && !welcome.html.includes("Hey Hey"));
  mail.length = 0;

  // Partner profile for an existing coach: Pending + admin email.
  r = await post(submit, { kind: "profile", email: "DANA@coachmail.dev", platform: "paperbell", profileUrl: "dana.paperbell.me" });
  assert.strictEqual(r.statusCode, 400, "paid platforms need the Coach-Halo link answer");
  assert.strictEqual(JSON.parse(r.body).error, "invalid_via_link");
  r = await post(submit, { kind: "profile", email: "DANA@coachmail.dev", platform: "paperbell", profileUrl: "dana.paperbell.me", viaLink: "unsure", platformEmail: "dana.work@coachmail.dev" });
  assert.strictEqual(r.statusCode, 200, r.body);
  assert.strictEqual(dana.fields["Referral Status"], "Pending");
  assert.strictEqual(dana.fields["Partner Platform"], "Paperbell");
  assert.strictEqual(dana.fields["Partner Profile URL"], "https://dana.paperbell.me");
  assert.strictEqual(dana.fields["Signed Up Via Coach-Halo Link"], "Not sure");
  assert.strictEqual(dana.fields["Partner Account Email"], "dana.work@coachmail.dev");
  assert.ok(mail[0].subject.includes("Partner verification needed: Dana Coachwell (Paperbell)"));
  assert.ok(mail[0].html.includes("Matches Paperbell"));
  assert.ok(mail[0].html.includes("attributed to Coach-Halo") && mail[0].html.includes("Review case by case"));
  mail.length = 0;

  // MentorCruise needs no attribution answer; switching clears the old answer.
  r = await post(submit, { kind: "profile", email: "dana@coachmail.dev", platform: "mentorcruise", profileUrl: "mentorcruise.com/mentor/dana", viaLink: "yes" });
  assert.strictEqual(r.statusCode, 200, r.body);
  assert.ok(!("Signed Up Via Coach-Halo Link" in dana.fields));
  assert.ok(!("Partner Account Email" in dana.fields));
  assert.ok(!mail[0].html.includes("Review case by case"));
  mail.length = 0;
  r = await post(submit, { kind: "profile", email: "dana@coachmail.dev", platform: "paperbell", profileUrl: "dana.paperbell.me", viaLink: "yes" });
  assert.strictEqual(r.statusCode, 200, r.body);
  assert.strictEqual(dana.fields["Signed Up Via Coach-Halo Link"], "Yes");
  assert.ok(!mail[0].html.includes("Review case by case"));
  mail.length = 0;

  // Unknown email: minimal Pending row, flagged incomplete.
  r = await post(submit, { kind: "affiliate", email: "new@coachmail.dev", website: "newcoach.com", affiliateUrl: "newcoach.com/affiliates", commission: "20% recurring" });
  assert.strictEqual(r.statusCode, 200, r.body);
  const fresh = [...rows.values()].find((x) => x.fields["Coach Email"] === "new@coachmail.dev");
  assert.strictEqual(fresh.fields["Referral Status"], "Pending");
  assert.ok(!("Account Type" in fresh.fields));
  assert.ok(mail[0].html.includes("no /join intake yet"));
  mail.length = 0;

  // Invalid inputs.
  for (const bad of [
    { kind: "profile", email: "x@coachmail.dev", platform: "bark", profileUrl: "bark.com/x" },
    { kind: "profile", email: "x@coachmail.dev", platform: "mentorcruise", profileUrl: "not a url" },
    { kind: "affiliate", email: "x@coachmail.dev", website: "a.com", affiliateUrl: "a.com/aff" },
    { kind: "profile", email: "nope", platform: "mentorcruise", profileUrl: "mentorcruise.com/x" },
    { kind: "profile", email: "x@coachmail.dev", platform: "coachful", profileUrl: "coachful.co/x", viaLink: "maybe" },
    { kind: "profile", email: "x@coachmail.dev", platform: "coachful", profileUrl: "coachful.co/x", viaLink: "yes", platformEmail: "not-an-email" },
  ]) {
    r = await post(submit, bad);
    assert.strictEqual(r.statusCode, 400, JSON.stringify(bad));
  }
  // Honeypot: silent success, nothing written.
  const before = rows.size;
  r = await post(submit, { kind: "profile", email: "bot@coachmail.dev", platform: "mentorcruise", profileUrl: "mentorcruise.com/x", company: "spam" });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(rows.size, before);

  // Activation: send fails -> timestamp cleared; next run sends once.
  dana.fields["Referral Status"] = "Active";
  failSend = true;
  await activation.handler({});
  assert.ok(!dana.fields["Activation Email Sent At"]);
  failSend = false;
  await activation.handler({});
  assert.ok(dana.fields["Activation Email Sent At"]);
  assert.ok(dana.fields["Verified Date"]);
  assert.strictEqual(mail.length, 1);
  assert.ok(mail[0].subject.includes("You're all set! Your Coach-Halo referrals are now active"));
  assert.ok(mail[0].html.includes("Hi Coach Dana,") && mail[0].html.includes("Happy coaching,"));
  await activation.handler({});
  assert.strictEqual(mail.length, 1, "no duplicate activation email");
  mail.length = 0;

  // Active coach re-submits: only Partner Last Submission changes.
  const snapshot = JSON.stringify(Object.assign({}, dana.fields, { "Partner Last Submission": undefined }));
  r = await post(submit, { kind: "profile", email: "dana@coachmail.dev", platform: "coachful", profileUrl: "coachful.co/dana", viaLink: "no" });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(dana.fields["Referral Status"], "Active");
  assert.strictEqual(dana.fields["Partner Platform"], "Paperbell");
  assert.ok(dana.fields["Partner Last Submission"].includes("Coachful"));
  assert.strictEqual(JSON.stringify(Object.assign({}, dana.fields, { "Partner Last Submission": undefined })), snapshot);
  assert.ok(mail[0].subject.includes("Active partner re-submitted"));
  assert.strictEqual(r.body, JSON.stringify({ ok: true }));

  console.log("all partner function checks passed");
}

main().catch((err) => { console.error(err); process.exit(1); });
