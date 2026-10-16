/* Keep slugs aligned with netlify/functions/events-lib.js */
(function () {
  var TIME_ZONES = [
    'America/Los_Angeles',
    'America/Denver',
    'America/Phoenix',
    'America/Chicago',
    'America/New_York',
    'America/Anchorage',
    'Pacific/Honolulu',
    'America/Puerto_Rico'
  ];
  var ORGANIZER_NOTE = 'Events are hosted by independent organizers. Register on the organizer’s website.';
  var HUB = {
    headline: 'Find an event for your next step.',
    lead: 'Explore free online events on careers, relationships, money, wellbeing, and more. Choose a topic that matters to you.'
  };
  var TOPICS = {
    career: {
      label: 'careers',
      card: 'Career',
      blurb: 'Changing careers, interviews, and figuring out your next step.',
      headline: 'Free online events about careers and your next step.',
      lead: 'Explore changing careers, preparing for interviews, and figuring out what comes next.',
      example: 'For example, changing careers, preparing for interviews, or figuring out your next step.',
      match: {
        coachingType: 'Career coaching',
        coachingTypeCategory: 'Career Coaching',
        goals: 'Career change and job search'
      }
    },
    leadership: {
      label: 'leadership',
      card: 'Leadership',
      blurb: 'Leading a team, giving feedback, and growing in your role.',
      headline: 'Free online events about leadership.',
      lead: 'Explore leading a team, giving feedback, and growing into a bigger role.',
      example: 'For example, leading a team, giving feedback, or stepping into a bigger role.',
      match: {
        coachingType: 'Career coaching',
        coachingTypeCategory: 'Career Coaching',
        goals: 'Leadership and growing in the job I already have'
      }
    },
    business: {
      label: 'business',
      card: 'Business',
      blurb: 'Starting something, finding customers, and decisions as an owner.',
      headline: 'Free online events about running a business.',
      lead: 'Explore starting something, finding customers, and making decisions as an owner.',
      example: 'For example, starting a business, finding customers, or making your next decision.',
      match: {
        coachingType: 'Career coaching',
        coachingTypeCategory: 'Career Coaching',
        goals: 'Starting or running a business'
      }
    },
    divorce: {
      label: 'divorce',
      card: 'Divorce',
      blurb: 'Separation, co-parenting, and what comes next.',
      headline: 'Free online events about divorce and separation.',
      lead: 'Explore separation, co-parenting, and what comes next.',
      example: 'For example, navigating a separation, co-parenting, or figuring out what comes next.',
      match: {
        coachingType: 'Life coaching',
        coachingTypeCategory: 'Life Coaching',
        goals: 'Divorce, separation, and dating again'
      }
    },
    relationships: {
      label: 'relationships',
      card: 'Relationships',
      blurb: 'Communicating, trust, and hard seasons with someone you care about.',
      headline: 'Free online events about relationships.',
      lead: 'Explore communicating better, rebuilding trust, and navigating a hard season.',
      example: 'For example, communicating better, rebuilding trust, or navigating a breakup.',
      match: {
        coachingType: 'Relationship & marriage',
        coachingTypeCategory: 'Marriage and Relationship Counseling',
        goals: 'Relationships and communication'
      }
    },
    habits: {
      label: 'wellbeing',
      card: 'Wellbeing',
      blurb: 'Everyday stress, routines, and making time for yourself.',
      headline: 'Free online events about wellbeing.',
      lead: 'Explore managing everyday stress, building routines, and making time for yourself.',
      example: 'For example, managing everyday stress, building routines, or making time for yourself.',
      match: {
        coachingType: 'Life coaching',
        coachingTypeCategory: 'Life Coaching',
        goals: 'Habits and a life reset'
      }
    },
    'financial-planning': {
      label: 'money',
      card: 'Money',
      blurb: 'Budgeting, money confidence, and your next financial step.',
      headline: 'Free online events about money and financial wellbeing.',
      lead: 'Explore budgeting, building money confidence, and taking your next financial step.',
      example: 'For example, managing debt, building money confidence, or knowing where to start.',
      coachName: 'Jake Randall',
      coachLine: 'Helps young professionals pay off their debt in half the time.',
      match: {
        coachingType: 'Financial wellness',
        coachingTypeCategory: 'Personal Financial Planning',
        goals: 'Budgets, money confidence, and long-term money habits',
        fixedCoachName: 'Jake Randall'
      }
    }
  };

  function consentTextFor(coachName) {
    return (
      'I want Coach-Halo to introduce me to ' +
      (coachName || 'a coach') +
      ' and share my first name, email, topic, time zone, and availability.'
    );
  }

  var topic = currentTopic();
  var pageTitle = document.title;
  var alertRecord = { id: '', email: '' };
  var gateRecord = { id: '', email: '' };
  var gate = document.getElementById('event-gate');

  function currentTopic() {
    var params = new URLSearchParams(location.search);
    var fromQuery = params.get('topic') || '';
    if (TOPICS[fromQuery]) return fromQuery;
    var parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] === 'events' && TOPICS[parts[1]]) return parts[1];
    return '';
  }

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showError(el, text) {
    el.className = 'message error';
    el.textContent = text;
  }

  function clearError(el) {
    el.className = 'message';
    el.textContent = '';
  }

  function emailOk(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function renderHub() {
    document.getElementById('page-title').textContent = HUB.headline;
    document.getElementById('page-lead').textContent = HUB.lead;
    document.getElementById('check-line').hidden = true;
    var list = document.getElementById('topic-list');
    Object.keys(TOPICS).forEach(function (slug) {
      var item = TOPICS[slug];
      var card = document.createElement('a');
      card.className = 'topic-card';
      card.href = '/events/' + slug + '/';
      card.innerHTML = '<h2>' + esc(item.card) + '</h2><p>' + esc(item.blurb) + '</p>';
      list.appendChild(card);
    });
  }

  function setCanonical(path) {
    var link = document.querySelector('link[rel="canonical"]');
    if (link) link.href = 'https://coach-halo.com' + path;
  }

  function renderNiche() {
    var info = TOPICS[topic];
    document.getElementById('topic-list').hidden = true;
    document.getElementById('eyebrow').textContent = 'Events';
    document.getElementById('page-title').textContent = info.headline;
    document.getElementById('page-lead').textContent = info.lead;
    document.getElementById('check-line').textContent = ORGANIZER_NOTE;
    document.getElementById('check-line').hidden = false;
    document.getElementById('alert').hidden = false;
    ['note-example', 'gate-note-example'].forEach(function (id) {
      var hint = document.getElementById(id);
      if (hint) hint.textContent = info.example;
    });
    document.title = info.headline + ' — Coach-Halo';
    pageTitle = document.title;
    setCanonical('/events/' + topic + '/');
    var description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', info.lead + ' Coach-Halo.');
  }

  function renderEvents(payload) {
    var emptyEl = document.getElementById('event-empty');
    var listEl = document.getElementById('event-list');
    emptyEl.hidden = false;
    if (!payload || payload.configured === false) {
      emptyEl.textContent = 'The list isn’t available yet.';
      return;
    }
    if (!payload.ok) {
      emptyEl.textContent = 'The list didn’t load. Refresh the page.';
      return;
    }
    var events = payload.events || [];
    if (!events.length) {
      emptyEl.textContent = 'No events listed right now.';
      return;
    }
    emptyEl.hidden = true;
    listEl.hidden = false;
    events.forEach(function (item) {
      var card = document.createElement('a');
      card.className = 'event-card';
      card.href = item.url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.innerHTML =
        '<p class="event-when">' + esc(item.when) + '</p>' +
        '<div><h2>' + esc(item.name) + '</h2>' +
        (item.summary ? '<p>' + esc(item.summary) + '</p>' : '') +
        (item.host ? '<p class="event-host">' + esc(item.host) + '</p>' : '') +
        '</div>' + (item.free === false ? '' : '<span class="event-cost">Free</span>');
      card.addEventListener('click', function (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        openGate(item);
      });
      listEl.appendChild(card);
    });
  }

  function coachFirst(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'your coach';
  }

  function topicChipLabel() {
    return (TOPICS[topic] && TOPICS[topic].label) || topic || '';
  }

  function fillSignupBanner() {}

  function usablePhoto(url) {
    var value = String(url || '').trim();
    if (!/^https:\/\//i.test(value)) return '';
    if (/ui-avatars\.com|dicebear|placeholder|gravatar\.com\/avatar/i.test(value)) return '';
    return value;
  }

  function bindPhotoFallback(root) {
    root.querySelectorAll('.coach-avatar img').forEach(function (img) {
      img.addEventListener('error', function () {
        var avatar = img.parentElement;
        img.remove();
        if (avatar) avatar.classList.remove('has-photo');
      });
    });
  }

  function coachMarkup(prefix, coach) {
    if (!coach || !coach.name) return '';
    var first = coachFirst(coach.name);
    var initial = String(coach.name).charAt(0).toUpperCase();
    var photoUrl = usablePhoto(coach.image);
    var photo = photoUrl
      ? '<img src="' + esc(photoUrl) + '" alt="" width="72" height="72">'
      : '';
    var line = String(coach.line || '').trim();
    var title = String(coach.title || '').trim();
    if (line && title && line.toLowerCase() === title.toLowerCase()) title = '';
    var support = line || title;
    var skip = prefix === 'gate'
      ? ''
      : '<button type="button" class="link-quiet-coach" id="' + prefix + '-skip">Just send me event updates</button>';
    var request = coach.freeIntro === false
      ? ''
      : '<button type="button" class="btn-primary" id="' + prefix + '-request">Request a free intro with ' +
        esc(first) + '</button>' +
        '<span class="coach-connect-note">We’ll introduce you by email so you can arrange a free introductory call.</span>';
    return (
      '<div class="coach-match-card">' +
      '<div class="coach-row">' +
      '<div class="coach-avatar' + (photoUrl ? ' has-photo' : '') + '">' +
      photo +
      '<span class="coach-avatar-fallback">' + esc(initial) + '</span>' +
      '</div>' +
      '<div class="coach-meta">' +
      '<div class="coach-name-display">' + esc(coach.name) + '</div>' +
      (support ? '<div class="coach-role-display">' + esc(support) + '</div>' : '') +
      '</div></div>' +
      '<div id="' + prefix + '-ask">' +
      '<div id="' + prefix + '-actions">' +
      request +
      '</div>' +
      '<form id="' + prefix + '-intro" class="coach-availability-block" hidden>' +
      '<p class="coach-availability-title">Preferred times for your intro call</p>' +
      '<p class="coach-availability-lead">Choose your timezone, then add up to three date and time windows so we can coordinate your intro.</p>' +
      '<p class="coach-availability-duration">Complimentary discovery calls are usually about <strong>30–45 minutes</strong>.</p>' +
      '<div class="field-group"><label for="' + prefix + '-tz">Your timezone</label>' +
      '<select id="' + prefix + '-tz" required></select></div>' +
      '<div id="' + prefix + '-windows">' +
      '<div class="field-group"><label for="' + prefix + '-slot-1">Time window 1</label>' +
      '<input type="datetime-local" id="' + prefix + '-slot-1" required></div>' +
      '<div class="field-group"><label for="' + prefix + '-slot-2">Time window 2 <span class="optional">(optional)</span></label>' +
      '<input type="datetime-local" id="' + prefix + '-slot-2"></div>' +
      '<div class="field-group"><label for="' + prefix + '-slot-3">Time window 3 <span class="optional">(optional)</span></label>' +
      '<input type="datetime-local" id="' + prefix + '-slot-3"></div>' +
      '</div>' +
      '<label class="check-row"><input type="checkbox" id="' + prefix + '-consent"><span class="check-label">' +
      esc(consentTextFor(coach.name)) +
      '</span></label>' +
      '<button type="submit" class="btn-primary">Send my introduction request</button>' +
      '<button type="button" class="link-quiet-coach" id="' + prefix + '-back">Back</button>' +
      '<p class="message" id="' + prefix + '-intro-message" role="alert"></p>' +
      '</form></div>' +
      '<p class="section-intro" id="' + prefix + '-after" hidden></p>' +
      '</div>' +
      skip
    );
  }

  function matchCoach(record) {
    var info = TOPICS[topic];
    if (!info || !info.match) return Promise.resolve(null);
    var guessedTz = '';
    try { guessedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var goals = info.match.goals || '';
    if (record.note) goals = goals ? goals + '. ' + record.note : record.note;
    return fetch('/.netlify/functions/match-coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'coach-halo-events',
        topic: topic,
        firstName: record.name || '',
        email: record.email || '',
        coachingType: info.match.coachingType,
        coachingTypeCategory: info.match.coachingTypeCategory,
        goals: goals,
        notes: record.note || '',
        timezone: guessedTz
      })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data || !data.ok || !data.name) return null;
        var reason = String(data.match_reason || '').trim();
        var title = String(data.title || '').trim();
        if (/^based on the topic/i.test(reason)) reason = '';
        return {
          name: data.name,
          title: reason ? '' : title,
          line: reason || title,
          image: data.image || data.outseta_image_url || data.photo || '',
          freeIntro: data.free_intro !== false
        };
      });
    }).catch(function () { return null; });
  }

  function zoneOptions(select) {
    var detected = '';
    try { detected = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var zones = TIME_ZONES.slice();
    if (detected && zones.indexOf(detected) === -1) zones.unshift(detected);
    select.innerHTML = '<option value="">Select timezone</option>';
    zones.forEach(function (zone) {
      var option = document.createElement('option');
      option.value = zone;
      option.textContent = zone.replace(/_/g, ' ');
      if (zone === detected) option.selected = true;
      select.appendChild(option);
    });
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function windowFromLocal(value) {
    var match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(value || '').trim());
    if (!match) return null;
    var hour = Number(match[2]);
    var minute = Number(match[3]) + 45;
    hour += Math.floor(minute / 60);
    minute = minute % 60;
    if (hour > 23) hour = 23;
    return {
      date: match[1],
      start: match[2] + ':' + match[3],
      end: pad2(hour) + ':' + pad2(minute)
    };
  }

  function readWindows(prefix) {
    return [1, 2, 3].map(function (n) {
      var el = document.getElementById(prefix + '-slot-' + n);
      return el ? windowFromLocal(el.value) : null;
    }).filter(Boolean);
  }

  function wireCoach(prefix, record, coach) {
    var root = document.getElementById(prefix === 'alert' ? 'coach-step' : 'gate-coach-step');
    if (!coach || !coach.name || !record.id) {
      root.hidden = true;
      root.innerHTML = '';
      return;
    }
    var offer = document.getElementById(prefix === 'alert' ? 'alert-coach-offer' : 'gate-coach-offer');
    if (offer) offer.hidden = false;
    root.hidden = false;
    root.innerHTML = coachMarkup(prefix, coach);
    bindPhotoFallback(root);
    var select = document.getElementById(prefix + '-tz');
    zoneOptions(select);
    var request = document.getElementById(prefix + '-request');
    if (request) request.addEventListener('click', function () {
      document.getElementById(prefix + '-intro').hidden = false;
      document.getElementById(prefix + '-actions').hidden = true;
      select.focus();
    });
    document.getElementById(prefix + '-back').addEventListener('click', function () {
      document.getElementById(prefix + '-intro').hidden = true;
      document.getElementById(prefix + '-actions').hidden = false;
    });
    var skip = document.getElementById(prefix + '-skip');
    if (skip) {
      skip.addEventListener('click', function () {
        var offer = document.getElementById(prefix === 'alert' ? 'alert-coach-offer' : 'gate-coach-offer');
        if (offer) offer.hidden = true;
      });
    }
    document.getElementById(prefix + '-intro').addEventListener('submit', function (event) {
      event.preventDefault();
      var message = document.getElementById(prefix + '-intro-message');
      clearError(message);
      var consent = document.getElementById(prefix + '-consent');
      if (!select.value) { showError(message, 'Choose your time zone.'); select.focus(); return; }
      if (!consent.checked) { showError(message, 'Check the box if you want Coach-Halo to make this introduction.'); consent.focus(); return; }
      var button = event.target.querySelector('button[type="submit"]');
      if (button.dataset.sending === '1') return;
      button.dataset.sending = '1';
      button.disabled = true;
      fetch('/.netlify/functions/save-event-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'introduction',
          record_id: record.id,
          email: record.email,
          coach_name: coach.name,
          time_zone: select.value,
          windows: readWindows(prefix),
          consent: true,
          consent_wording: consentTextFor(coach.name)
        })
      }).then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok && data && data.ok, data: data }; });
      }).then(function (result) {
        if (!result.ok) {
          button.dataset.sending = '';
          button.disabled = false;
          showError(message, (result.data && result.data.message) || 'Something went wrong. Try again.');
          return;
        }
        if (typeof window.datafast === 'function') {
          window.datafast('event_intro_request', { topic: topic });
        }
        finishCoach(prefix, 'Someone will email you to set a time. That time is a preference, not a booked appointment.');
      }).catch(function () {
        button.dataset.sending = '';
        button.disabled = false;
        showError(message, 'Something went wrong. Try again.');
      });
    });
  }

  function showEventRegisterLink() {
    var cont = document.getElementById('gate-continue');
    if (!cont) return;
    var name = (gate.dataset.session || '').trim();
    cont.textContent = 'Continue to event registration';
    cont.hidden = false;
  }

  function hideEventRegisterLink() {
    var cont = document.getElementById('gate-continue');
    if (cont) cont.hidden = true;
  }

  function finishCoach(prefix, text) {
    var root = document.getElementById(prefix === 'alert' ? 'coach-step' : 'gate-coach-step');
    var after = document.getElementById(prefix + '-after');
    var ask = document.getElementById(prefix + '-ask');
    if (ask) ask.hidden = true;
    if (after) {
      after.hidden = false;
      after.textContent = text;
    } else if (root) {
      root.hidden = true;
    }
    fillSignupBanner(prefix, false);
    var skip = document.getElementById(prefix + '-skip');
    if (skip) skip.hidden = true;
    if (prefix === 'gate') showEventRegisterLink();
  }

  function confirmCopy(welcomeSent) {
    var label = (TOPICS[topic] && TOPICS[topic].label) || 'this topic';
    var text = 'We’ll email you when new events on ' + label + ' are available.';
    if (welcomeSent) text += ' We sent a welcome email.';
    return text;
  }

  function showSaved(prefix, record, sessionName, welcomeSent) {
    var doneCopy = confirmCopy(welcomeSent);
    if (prefix === 'alert') {
      document.getElementById('alert').classList.add('is-done');
      document.getElementById('alert-form').hidden = true;
      document.getElementById('alert-done').hidden = false;
      document.getElementById('alert-done-copy').textContent = doneCopy;
      document.getElementById('alert-coach-offer').hidden = true;
      document.getElementById('coach-step').innerHTML = '';
    } else {
      document.getElementById('gate-ask').hidden = true;
      document.getElementById('gate-done').hidden = false;
      document.getElementById('gate-done-copy').textContent = doneCopy;
      document.getElementById('gate-event-kept').textContent = sessionName || '';
      document.getElementById('gate-coach-offer').hidden = true;
      document.getElementById('gate-coach-step').innerHTML = '';
      showEventRegisterLink();
    }
    if (typeof window.datafast === 'function') {
      window.datafast('event_alert_signup', { topic: topic, signed_up_from: sessionName || 'Alert form' });
    }
    matchCoach(record).then(function (coach) {
      if (!coach) {
        var root = document.getElementById(prefix === 'alert' ? 'coach-step' : 'gate-coach-step');
        root.hidden = true;
        root.innerHTML = '';
        var offer = document.getElementById(prefix === 'alert' ? 'alert-coach-offer' : 'gate-coach-offer');
        if (offer) offer.hidden = true;
        if (prefix === 'gate') showEventRegisterLink();
        return;
      }
      wireCoach(prefix, record, coach);
    });
  }

  function submitAlert(form, fields, messageEl, button, record, prefix, sessionName) {
    clearError(messageEl);
    var name = fields.name.value.trim();
    var email = fields.email.value.trim();
    if (!name) { showError(messageEl, 'Please enter your first name.'); fields.name.focus(); return; }
    if (!email || !emailOk(email)) { showError(messageEl, 'Please enter a valid email address.'); fields.email.focus(); return; }
    if (window.jhSignupNameProblem) {
      var nameProblem = window.jhSignupNameProblem(name);
      if (nameProblem) { showError(messageEl, nameProblem); fields.name.focus(); return; }
    }
    if (window.jhSignupEmailProblem) {
      var emailProblem = window.jhSignupEmailProblem(email);
      if (emailProblem) { showError(messageEl, emailProblem); fields.email.focus(); return; }
    }
    if (button.dataset.sending === '1') return;
    button.dataset.sending = '1';
    button.disabled = true;
    fetch('/.netlify/functions/save-event-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'alert',
        topic: topic,
        name: name,
        email: email,
        session_note: fields.note.value.trim(),
        signed_up_from: prefix === 'gate' ? 'Event click' : 'Category page',
        event_id: prefix === 'gate' ? (gate.dataset.eventId || '') : '',
        event_url: prefix === 'gate' ? (gate.dataset.eventUrl || '') : ''
      })
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok && data && data.ok, data: data }; });
    }).then(function (result) {
      if (!result.ok) {
        button.dataset.sending = '';
        button.disabled = false;
        showError(messageEl, (result.data && result.data.message) || 'Something went wrong. Try again.');
        return;
      }
      record.id = result.data.id || '';
      record.email = email;
      record.name = name;
      record.note = fields.note.value.trim();
      showSaved(prefix, record, sessionName, !!(result.data && result.data.welcome_sent));
    }).catch(function () {
      button.dataset.sending = '';
      button.disabled = false;
      showError(messageEl, 'Something went wrong. Try again.');
    });
  }

  function openGate(item) {
    document.getElementById('gate-skip').href = item.url;
    document.getElementById('gate-continue').href = item.url;
    gate.dataset.session = item.name || '';
    gate.dataset.eventId = item.id || '';
    gate.dataset.eventUrl = item.url || '';
    document.getElementById('gate-event-title').textContent = item.name || '';
    var gateForm = document.getElementById('gate-form');
    gateForm.reset();
    gateForm.hidden = false;
    var gateSubmit = gateForm.querySelector('button[type="submit"]');
    if (gateSubmit) {
      gateSubmit.disabled = false;
      gateSubmit.dataset.sending = '';
    }
    clearError(document.getElementById('gate-message'));
    document.getElementById('gate-ask').hidden = false;
    document.getElementById('gate-done').hidden = true;
    document.getElementById('gate-coach-step').innerHTML = '';
    fillSignupBanner('gate', false);
    hideEventRegisterLink();
    gateRecord.id = '';
    gateRecord.email = '';
    gate.hidden = false;
    gate.classList.add('is-open');
    document.title = (item.name || 'Event') + ' — Coach-Halo';
    var card = gate.querySelector('.event-gate-card');
    if (card) card.focus();
  }

  function closeGate() {
    gate.classList.remove('is-open');
    gate.hidden = true;
    document.title = pageTitle;
  }

  if (!topic) {
    renderHub();
  } else {
    renderNiche();
    fetch('/.netlify/functions/fetch-events?topic=' + encodeURIComponent(topic))
      .then(function (res) { return res.json(); })
      .then(renderEvents)
      .catch(function () { renderEvents({ ok: false }); });

    document.getElementById('alert-form').addEventListener('submit', function (event) {
      event.preventDefault();
      submitAlert(
        event.target,
        {
          name: document.getElementById('first_name'),
          email: document.getElementById('email'),
          note: document.getElementById('session_note')
        },
        document.getElementById('alert-message'),
        event.target.querySelector('button[type="submit"]'),
        alertRecord,
        'alert',
        'Alert form'
      );
    });

    document.getElementById('gate-close').addEventListener('click', closeGate);
    gate.addEventListener('click', function (event) {
      if (event.target === gate) closeGate();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && gate.classList.contains('is-open')) closeGate();
    });
    document.getElementById('gate-form').addEventListener('submit', function (event) {
      event.preventDefault();
      submitAlert(
        event.target,
        {
          name: document.getElementById('gate_first_name'),
          email: document.getElementById('gate_email'),
          note: document.getElementById('gate_session_note')
        },
        document.getElementById('gate-message'),
        event.target.querySelector('button[type="submit"]'),
        gateRecord,
        'gate',
        gate.dataset.session || 'Session'
      );
    });
  }
})();
