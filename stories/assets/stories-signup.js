(function () {
  const SIGNUP_API = "/.netlify/functions/stories-signup";
  const MATCH_API_CANDIDATES = [
    "/.netlify/functions/match-coach",
    "https://job-halo.com/.netlify/functions/match-coach"
  ];
  const STEP_LABELS = { 1: "Situation", 2: "Your words", 3: "Email", 4: "Coach intro", 5: "Done" };
  const SITUATION_CATEGORY = {
    "Divorce / Separation": "Relationship Coaching",
    "Breakup": "Relationship Coaching",
    "Dating Again": "Relationship Coaching",
    "Loneliness / Friendships": "Relationship Coaching",
    "Career Change": "Career Coaching",
    "Job Loss": "Career Coaching",
    "Feeling Stuck": "Life Coaching",
    "Starting Over": "Life Coaching",
    "Major Life Decisions": "Life Coaching",
    "Other": "Life Coaching"
  };
  const CAREER_HINTS = /\b(job|career|work|layoff|laid[- ]?off|unemploy|interview|resume|linkedin|promotion|boss|office|salary|hiring|fired|redundan)/i;
  const RELATIONSHIP_HINTS = /\b(divorce|separat|break[- ]?up|ex[- ]|dating|relationship|marriage|partner|lonely|friendship|widow)/i;

  function track(name, props) {
    try {
      if (typeof window.datafast === "function") window.datafast(name, props || {});
    } catch (err) { /* ignore */ }
  }

  const params = new URLSearchParams(location.search);
  const state = {
    step: 1,
    situation: "",
    struggles: "",
    firstName: "",
    email: "",
    recordId: null,
    coachingInterest: "pending_coach_connect",
    connected: false,
    coachCategory: "",
    matchedCoach: null,
    leadSource: params.get("source") || "stories-landing",
    connectFlow: false,
    storyId: params.get("story") || "",
    storySlug: params.get("slug") || "",
    campaign: params.get("utm_campaign") || params.get("reddit_campaign") || "",
    utmSource: params.get("utm_source") || "",
    utmMedium: params.get("utm_medium") || ""
  };

  const progressLabel = document.getElementById("progress-label");
  const steps = document.querySelectorAll(".wizard-step");
  if (!progressLabel || !steps.length) return;

  function emailOk(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  }
  function setStep(n) {
    state.step = n;
    steps.forEach((el) => el.classList.toggle("is-active", Number(el.dataset.step) === n));
    progressLabel.textContent = "Step " + n + " of 5 · " + STEP_LABELS[n];
    document.querySelectorAll(".dot").forEach((d) => {
      const i = Number(d.dataset.dot);
      d.classList.toggle("is-on", i === n);
      d.classList.toggle("is-done", i < n);
    });
  }
  function showErr(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("is-show", !!on);
  }
  function resolveCoachCategory(situation, struggles) {
    const base = SITUATION_CATEGORY[situation] || "Life Coaching";
    const text = String(struggles || "");
    if (base === "Life Coaching" || situation === "Other" || situation === "Feeling Stuck" || situation === "Starting Over" || situation === "Major Life Decisions") {
      if (CAREER_HINTS.test(text)) return "Career Coaching";
      if (RELATIONSHIP_HINTS.test(text)) return "Relationship Coaching";
    }
    return base;
  }
  function coachFirstName(coach) {
    if (!coach) return "a coach";
    if (coach.short) return coach.short;
    const name = String(coach.name || "").trim();
    return name.split(/[\s—(]/)[0] || "a coach";
  }
  function attributionFields() {
    return {
      storyId: state.storyId,
      storySlug: state.storySlug,
      campaign: state.campaign,
      utmSource: state.utmSource,
      utmMedium: state.utmMedium
    };
  }
  function selectSituation(value) {
    if (!value) return;
    state.situation = value;
    document.querySelectorAll("#situation-choices .choice").forEach((c) => {
      c.setAttribute("aria-pressed", c.dataset.value === value ? "true" : "false");
    });
    showErr("err-situation", false);
  }

  function fillGenericCoachUI() {
    state.matchedCoach = null;
    const wrap = document.getElementById("coach-avatar-wrap");
    const img = document.getElementById("coach-photo");
    const initial = document.getElementById("coach-initial");
    if (wrap) wrap.classList.remove("has-photo");
    if (img) { img.hidden = true; img.removeAttribute("src"); }
    if (initial) initial.textContent = "CH";
    const nameEl = document.getElementById("coach-name-display");
    const roleEl = document.getElementById("coach-role-display");
    const whyEl = document.getElementById("coach-why");
    if (nameEl) nameEl.textContent = "A Coach-Halo coach";
    if (roleEl) roleEl.textContent = "Matched to situations like yours";
    if (whyEl) whyEl.textContent = "Based on what you shared, we can introduce you to a Coach-Halo coach whose work aligns with situations like yours.";
  }

  function fillCoachUI(coach) {
    if (!coach || !coach.name) { fillGenericCoachUI(); return; }
    state.matchedCoach = coach;
    const first = coachFirstName(coach);
    const wrap = document.getElementById("coach-avatar-wrap");
    const img = document.getElementById("coach-photo");
    const initial = document.getElementById("coach-initial");
    const photo = String(coach.image || coach.image_url || "").trim();
    if (photo && img && wrap) {
      img.src = photo;
      img.alt = coach.name;
      img.hidden = false;
      wrap.classList.add("has-photo");
    } else if (initial) {
      if (img) img.hidden = true;
      if (wrap) wrap.classList.remove("has-photo");
      initial.textContent = (first.charAt(0) || "C").toUpperCase();
    }
    const nameEl = document.getElementById("coach-name-display");
    const roleEl = document.getElementById("coach-role-display");
    const whyEl = document.getElementById("coach-why");
    if (nameEl) nameEl.textContent = coach.name;
    if (roleEl) roleEl.textContent = coach.title || "Coach-Halo coach";
    if (whyEl) {
      whyEl.textContent = "Based on what you shared about " + String(state.situation || "what you’re going through").toLowerCase() + ", " + first + " may be a relevant Coach-Halo coach to talk with.";
    }
    const heading = document.getElementById("coach-interest-heading");
    const pitch = document.getElementById("coach-discovery-pitch");
    const btn = document.getElementById("connect-coach-btn");
    if (heading) heading.textContent = "Interested in working with " + first + "?";
    if (pitch) {
      pitch.textContent = "Start with a free discovery call to talk about what you’re looking for and see if working together feels like a good fit. If you decide to continue, " + first + " can walk you through their coaching options and pricing.";
    }
    if (btn) btn.textContent = "Schedule a free discovery call with " + first;
  }

  async function matchCoachForSignup() {
    state.coachCategory = resolveCoachCategory(state.situation, state.struggles);
    const body = {
      category: state.coachCategory,
      coachingTypeCategory: state.coachCategory,
      goals: state.struggles,
      notes: state.situation,
      source: state.leadSource
    };
    for (const url of MATCH_API_CANDIDATES) {
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        if (data && data.ok && data.name) return data;
      } catch (err) { /* next */ }
    }
    return null;
  }

  function coachPayloadFields() {
    const c = state.matchedCoach;
    if (!c) {
      return { recommendedCoach: "matched_coach", coachCategory: state.coachCategory || "", matchedCoachId: "", matchedCoachName: "", matchedCoachEmail: "" };
    }
    return {
      recommendedCoach: c.name,
      coachCategory: c.matched_category || state.coachCategory || "",
      matchedCoachId: c.record_id || c.coach_id || "",
      matchedCoachName: c.name || "",
      matchedCoachEmail: c.coach_email || "",
      matchedCoachShort: c.short || coachFirstName(c)
    };
  }

  async function saveLead(action, extra) {
    const payload = Object.assign({
      action: action,
      recordId: state.recordId,
      firstName: state.firstName,
      email: state.email,
      situation: state.situation,
      struggles: state.struggles,
      source: state.leadSource || "stories-landing",
      status: "subscribed",
      signedUpAt: new Date().toISOString(),
      coachingInterest: state.coachingInterest
    }, coachPayloadFields(), attributionFields(), extra || {});
    const res = await fetch(SIGNUP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error((data && data.error) || ("API " + res.status));
    }
    if (data.recordId) state.recordId = data.recordId;
    return data;
  }

  document.querySelectorAll("#situation-choices .choice").forEach((btn) => {
    btn.addEventListener("click", () => selectSituation(btn.dataset.value));
  });

  document.querySelectorAll("[data-next]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (state.step === 1) {
        if (!state.situation) { showErr("err-situation", true); return; }
        setStep(2);
        return;
      }
      if (state.step === 2) {
        state.struggles = (document.getElementById("struggles") || {}).value.trim();
        setStep(3);
        return;
      }
      if (state.step === 3) {
        const name = (document.getElementById("first-name") || {}).value.trim();
        const email = (document.getElementById("email") || {}).value.trim();
        let bad = false;
        if (!name) { showErr("err-name", true); bad = true; } else showErr("err-name", false);
        if (!emailOk(email)) { showErr("err-email", true); bad = true; } else showErr("err-email", false);
        if (bad) return;
        state.firstName = name;
        state.email = email;
        state.coachingInterest = "pending_coach_connect";
        const saveBtn = document.getElementById("save-lead-btn");
        saveBtn.disabled = true;
        saveBtn.textContent = "Matching a coach…";
        const coach = await matchCoachForSignup();
        if (coach) fillCoachUI(coach);
        else fillGenericCoachUI();
        saveBtn.textContent = "Saving…";
        try {
          await saveLead("lead_saved");
          showErr("err-save", false);
          track("stories_newsletter_completed", { situation: state.situation, source: state.leadSource });
          setStep(4);
        } catch (err) {
          showErr("err-save", true);
        }
        saveBtn.disabled = false;
        saveBtn.textContent = "Get My Weekly Stories";
      }
    });
  });

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      if (state.step === 2) setStep(1);
      else if (state.step === 3) setStep(2);
    });
  });

  const connectBtn = document.getElementById("connect-coach-btn");
  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      track("stories_discovery_started", { situation: state.situation, source: state.leadSource });
      document.getElementById("coach-offer-main").hidden = true;
      document.getElementById("coach-availability").hidden = false;
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const sel = document.getElementById("timezone");
        if (sel && [].some.call(sel.options, (o) => o.value === tz)) sel.value = tz;
      } catch (e) { /* ignore */ }
    });
  }
  const backOffer = document.getElementById("back-to-offer");
  if (backOffer) {
    backOffer.addEventListener("click", () => {
      document.getElementById("coach-availability").hidden = true;
      document.getElementById("coach-offer-main").hidden = false;
    });
  }
  const skipBtn = document.getElementById("skip-coach-btn");
  if (skipBtn) {
    skipBtn.addEventListener("click", async () => {
      if (state.connectFlow) {
        window.location.href = "/stories/";
        return;
      }
      state.coachingInterest = "declined_coach_connect";
      try {
        await saveLead("coach_connect_declined");
        finishThanks(false);
      } catch (err) {
        showErr("err-save", true);
      }
    });
  }
  const confirmBtn = document.getElementById("confirm-connect-btn");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      const tz = document.getElementById("timezone").value;
      const s1 = document.getElementById("slot1").value;
      const confirmed = document.getElementById("attend-confirm").checked;
      let bad = false;
      if (state.connectFlow) {
        const ident = document.getElementById("connect-identity");
        if (ident && !ident.hidden) {
          const n = (document.getElementById("connect-first-name").value || "").trim();
          const em = (document.getElementById("connect-email").value || "").trim();
          if (!n) { showErr("err-connect-name", true); bad = true; } else showErr("err-connect-name", false);
          if (!emailOk(em)) { showErr("err-connect-email", true); bad = true; } else showErr("err-connect-email", false);
          if (n) state.firstName = n;
          if (emailOk(em)) state.email = em;
        }
      }
      if (!tz) { showErr("err-tz", true); bad = true; } else showErr("err-tz", false);
      if (!s1) { showErr("err-slots", true); bad = true; } else showErr("err-slots", false);
      if (!confirmed) { showErr("err-confirm", true); bad = true; } else showErr("err-confirm", false);
      if (bad) return;
      state.coachingInterest = "requested_complimentary_connect";
      state.connected = true;
      try {
        await saveLead("coach_connect_request", {
          coachInterest: true,
          availabilityTimezone: tz,
          availabilitySlot1: s1,
          availabilitySlot2: document.getElementById("slot2").value || "",
          availabilitySlot3: document.getElementById("slot3").value || "",
          discussionTopic: document.getElementById("topic").value.trim()
        });
        track("stories_discovery_completed", { situation: state.situation, source: state.leadSource });
        finishThanks(true);
      } catch (err) {
        showErr("err-confirm", true);
        const el = document.getElementById("err-confirm");
        if (el) el.textContent = "We couldn’t send the intro request. Please try again.";
      }
    });
  }

  function finishThanks(withCoach) {
    const title = document.getElementById("thanks-title");
    const body = document.getElementById("thanks-body");
    const stories = document.getElementById("thanks-stories");
    const spam = document.getElementById("thanks-spam");
    if (state.connectFlow && withCoach) {
      const coachName = state.matchedCoach && state.matchedCoach.name ? String(state.matchedCoach.name).trim() : "your matched coach";
      title.textContent = "Request sent.";
      body.textContent = "We’ll email an introduction to " + coachName + " with the times you shared. That call is a free discovery call to see if working together feels like a fit. It is not a free coaching session.";
      stories.textContent = "You’ll keep receiving your weekly stories.";
      if (spam) spam.hidden = true;
      setStep(5);
      return;
    }
    title.textContent = "You’re in.";
    if (withCoach && state.matchedCoach && state.matchedCoach.name) {
      body.textContent = "Watch your inbox for a welcome email from Joaquin, creator of Coach-Halo, and an introduction to " + String(state.matchedCoach.name).trim() + ".";
    } else if (withCoach) {
      body.textContent = "Watch your inbox for a welcome email from Joaquin, creator of Coach-Halo, and an introduction to your matched coach.";
    } else {
      body.textContent = "Watch your inbox for a welcome email from Joaquin, creator of Coach-Halo.";
    }
    stories.textContent = "We’ll also start sending you free weekly stories based on what you told us you’re going through.";
    setStep(5);
  }

  function openEmailConnectFlow(q) {
    state.connectFlow = true;
    state.leadSource = q.get("source") || "stories-email-cta";
    state.email = (q.get("email") || "").trim();
    state.firstName = (q.get("first") || "").trim();
    state.recordId = (q.get("rid") || "").trim() || null;
    if (q.get("sit")) selectSituation(q.get("sit"));
    document.body.classList.add("connect-flow");
    const coach = {
      record_id: q.get("cid") || "",
      coach_id: q.get("cid") || "",
      name: q.get("cname") || "",
      title: q.get("ctitle") || "",
      image: q.get("cimage") || "",
      short: q.get("cshort") || ""
    };
    if (coach.name) fillCoachUI(coach);
    else fillGenericCoachUI();
    const first = coachFirstName(state.matchedCoach);
    const eyebrow = document.getElementById("signup-eyebrow");
    const lede = document.getElementById("signup-lede");
    const h2 = document.getElementById("signup-heading");
    if (eyebrow) eyebrow.textContent = "Free discovery call";
    if (h2) {
      h2.textContent = "";
      h2.appendChild(document.createTextNode("Confirm a time with "));
      const em = document.createElement("em");
      em.textContent = first;
      h2.appendChild(em);
    }
    if (lede) {
      lede.textContent = "Share a few times that work. We’ll email an intro to " + first + " so you can see if working together feels like a fit. That call is not a free coaching session.";
    }
    document.getElementById("coach-offer-main").hidden = true;
    document.getElementById("coach-availability").hidden = false;
    if (backOffer) backOffer.hidden = true;
    const identity = document.getElementById("connect-identity");
    if (identity) {
      identity.hidden = !( !state.firstName || !state.email );
      const nameInput = document.getElementById("connect-first-name");
      const emailInput = document.getElementById("connect-email");
      if (nameInput && state.firstName) nameInput.value = state.firstName;
      if (emailInput && state.email) emailInput.value = state.email;
    }
    setStep(4);
    const signup = document.getElementById("signup");
    if (signup) signup.scrollIntoView({ behavior: "auto", block: "start" });
  }

  if (params.get("connect") === "1") {
    openEmailConnectFlow(params);
  } else if (params.get("signup") === "1" || params.get("sit")) {
    if (params.get("sit")) selectSituation(params.get("sit"));
    if (params.get("signup") === "1") {
      track("stories_newsletter_cta_click", { source: state.leadSource });
      const signup = document.getElementById("signup");
      if (signup) signup.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }
})();
