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
  var TOPICS = {
    career: {
      label: 'Career change and job search',
      headline: 'Free sessions for a career change',
      lead: 'Live online sessions in the next five weeks for people changing careers or looking for work. Register with the host.',
      match: {
        coachingType: 'Career coaching',
        coachingTypeCategory: 'Career Coaching',
        goals: 'Career change and job search'
      }
    },
    leadership: {
      label: 'Leadership and the job you already have',
      headline: 'Free sessions for the job you already have',
      lead: 'Live online sessions in the next five weeks for people growing in the role they already have. Register with the host.',
      match: {
        coachingType: 'Career coaching',
        coachingTypeCategory: 'Career Coaching',
        goals: 'Leadership and growing in the job I already have'
      }
    },
    business: {
      label: 'Starting or running a business',
      headline: 'Free sessions for starting or running a business',
      lead: 'Live online sessions in the next five weeks for people starting or running a business. Register with the host.',
      match: {
        coachingType: 'Career coaching',
        coachingTypeCategory: 'Career Coaching',
        goals: 'Starting or running a business'
      }
    },
    divorce: {
      label: 'Divorce, separation, and dating again',
      headline: 'Free sessions for divorce, separation, and dating again',
      lead: 'Live online sessions in the next five weeks. Register with the host.',
      match: {
        coachingType: 'Life coaching',
        coachingTypeCategory: 'Life Coaching',
        goals: 'Divorce, separation, and dating again'
      }
    },
    relationships: {
      label: 'Relationships',
      headline: 'Free sessions for relationships',
      lead: 'Live online sessions in the next five weeks. Register with the host.',
      match: {
        coachingType: 'Relationship & marriage',
        coachingTypeCategory: 'Marriage and Relationship Counseling',
        goals: 'Relationships and communication'
      }
    },
    habits: {
      label: 'Habits and a life reset',
      headline: 'Free sessions for habits and a life reset',
      lead: 'Live online sessions in the next five weeks for people changing habits or starting over. Register with the host.',
      match: {
        coachingType: 'Life coaching',
        coachingTypeCategory: 'Life Coaching',
        goals: 'Habits and a life reset'
      }
    },
    'financial-planning': {
      label: 'Personal financial planning',
      headline: 'Free sessions on personal financial planning',
      lead: 'Live online sessions in the next five weeks on budgets, money confidence, and long-term money habits. Register with the host.',
      coachName: 'Jake Randall',
      coachLine: 'Works with people on budgets, money confidence, and long-term money habits.',
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
    var list = document.getElementById('topic-list');
    Object.keys(TOPICS).forEach(function (slug) {
      var item = TOPICS[slug];
      var card = document.createElement('a');
      card.className = 'topic-card';
      card.href = '/events/' + slug + '/';
      card.innerHTML = '<h2>' + esc(item.label) + '</h2><p>' + esc(item.lead) + '</p>';
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
    document.getElementById('eyebrow').textContent = 'Next five weeks · Pacific time';
    document.getElementById('page-title').textContent = info.headline;
    document.getElementById('page-lead').textContent = info.lead;
    document.getElementById('check-line').hidden = false;
    document.getElementById('alert').hidden = false;
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
      emptyEl.textContent = 'No free sessions listed for this week yet.';
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
        '</div><span class="event-cost">Free</span>';
      card.addEventListener('click', function (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        openGate(item);
      });
      listEl.appendChild(card);
    });
  }

  function coachMarkup(prefix, coach) {
    if (!coach || !coach.name) return '';
    var photo = coach.image
      ? '<img class="coach-photo" src="' + esc(coach.image) + '" alt="" width="56" height="56">'
      : '';
    var line = coach.line || coach.title || '';
    return (
      '<div class="coach-row">' + photo +
      '<div><p class="coach-line"><strong>' + esc(coach.name) + '</strong></p>' +
      (line ? '<p class="coach-line">' + esc(line) + '</p>' : '') +
      '</div></div>' +
      '<div id="' + prefix + '-ask">' +
      '<button type="button" class="btn-primary" id="' + prefix + '-request">Request an introduction</button>' +
      '<button type="button" class="btn-secondary" id="' + prefix + '-skip">Skip</button>' +
      '<form id="' + prefix + '-intro" hidden>' +
      '<div class="field-group"><label for="' + prefix + '-tz">Time zone</label><select id="' + prefix + '-tz" required></select></div>' +
      '<div class="field-group"><label>Times that work</label><div id="' + prefix + '-windows"></div>' +
      '<button type="button" class="text-action" id="' + prefix + '-add">Add another time</button></div>' +
      '<label class="check-row"><input type="checkbox" id="' + prefix + '-consent"><span class="check-label">' +
      esc(consentTextFor(coach.name)) +
      '</span></label>' +
      '<button type="submit" class="btn-primary">Send introduction request</button>' +
      '<p class="message" id="' + prefix + '-intro-message" role="alert"></p>' +
      '</form></div>' +
      '<p class="section-intro" id="' + prefix + '-after" hidden></p>'
    );
  }

  function matchCoach(record) {
    var info = TOPICS[topic];
    if (!info || !info.match) return Promise.resolve(null);
    if (info.match.fixedCoachName) {
      return Promise.resolve({
        name: info.match.fixedCoachName,
        line: info.coachLine || '',
        image: '',
        title: info.coachLine || ''
      });
    }
    var guessedTz = '';
    try { guessedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
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
        goals: info.match.goals,
        timezone: guessedTz
      })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data || !data.ok || !data.name) return null;
        return {
          name: data.name,
          title: data.title || '',
          line: data.match_reason || data.title || '',
          image: data.image || ''
        };
      });
    }).catch(function () { return null; });
  }

  function zoneOptions(select) {
    var detected = '';
    try { detected = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var zones = TIME_ZONES.slice();
    if (detected && zones.indexOf(detected) === -1) zones.unshift(detected);
    select.innerHTML = '<option value="">Select your time zone</option>';
    zones.forEach(function (zone) {
      var option = document.createElement('option');
      option.value = zone;
      option.textContent = zone.replace(/_/g, ' ');
      if (zone === detected) option.selected = true;
      select.appendChild(option);
    });
  }

  function addWindow(container) {
    if (container.querySelectorAll('.window-row').length >= 3) return;
    var row = document.createElement('div');
    row.className = 'window-row';
    row.innerHTML =
      '<input type="date" aria-label="Date" required>' +
      '<input type="time" aria-label="Start time" required>' +
      '<input type="time" aria-label="End time" required>';
    container.appendChild(row);
  }

  function readWindows(container) {
    return Array.prototype.map.call(container.querySelectorAll('.window-row'), function (row) {
      var inputs = row.querySelectorAll('input');
      return { date: inputs[0].value, start: inputs[1].value, end: inputs[2].value };
    }).filter(function (item) {
      return item.date || item.start || item.end;
    });
  }

  function wireCoach(prefix, record, coach) {
    var root = document.getElementById(prefix === 'alert' ? 'coach-step' : 'gate-coach-step');
    if (!coach || !coach.name || !record.id) {
      root.hidden = true;
      root.innerHTML = '';
      return;
    }
    root.hidden = false;
    root.innerHTML = coachMarkup(prefix, coach);
    var select = document.getElementById(prefix + '-tz');
    var windows = document.getElementById(prefix + '-windows');
    zoneOptions(select);
    addWindow(windows);
    document.getElementById(prefix + '-add').addEventListener('click', function () {
      addWindow(windows);
    });
    document.getElementById(prefix + '-request').addEventListener('click', function () {
      document.getElementById(prefix + '-intro').hidden = false;
      document.getElementById(prefix + '-request').hidden = true;
      select.focus();
    });
    document.getElementById(prefix + '-skip').addEventListener('click', function () {
      finishCoach(prefix, 'You’re on the list. We’ll email you when a free session in this topic is listed.');
    });
    document.getElementById(prefix + '-intro').addEventListener('submit', function (event) {
      event.preventDefault();
      var message = document.getElementById(prefix + '-intro-message');
      clearError(message);
      var consent = document.getElementById(prefix + '-consent');
      if (!select.value) { showError(message, 'Choose your time zone.'); select.focus(); return; }
      if (!consent.checked) { showError(message, 'Check the box if you want Coach-Halo to make this introduction.'); consent.focus(); return; }
      var button = event.target.querySelector('button[type="submit"]');
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
          windows: readWindows(windows),
          consent: true,
          consent_wording: consentTextFor(coach.name)
        })
      }).then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok && data && data.ok, data: data }; });
      }).then(function (result) {
        if (!result.ok) {
          button.disabled = false;
          showError(message, (result.data && result.data.message) || 'Something went wrong. Try again.');
          return;
        }
        if (typeof window.datafast === 'function') {
          window.datafast('event_intro_request', { topic: topic });
        }
        finishCoach(prefix, 'You’re on the list. Someone will email you to set a time. That time is a preference, not a booked appointment.');
      }).catch(function () {
        button.disabled = false;
        showError(message, 'Something went wrong. Try again.');
      });
    });
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
    var copy = document.getElementById(prefix === 'alert' ? 'alert-done-copy' : 'gate-done-copy');
    if (copy) copy.textContent = '';
  }

  function showSaved(prefix, record, sessionName) {
    var doneCopy = 'You’re on the list. Check your email for a welcome note. We’ll also email you when a free session in this topic is listed.';
    if (prefix === 'alert') {
      document.getElementById('alert-form').hidden = true;
      document.getElementById('alert-done').hidden = false;
      document.getElementById('alert-done-copy').textContent = doneCopy;
      document.getElementById('coach-step').hidden = true;
      document.getElementById('coach-step').innerHTML = '<p class="section-intro">Looking for a coach match…</p>';
      document.getElementById('coach-step').hidden = false;
    } else {
      document.getElementById('gate-ask').hidden = true;
      document.getElementById('gate-done').hidden = false;
      document.getElementById('gate-done-copy').textContent = doneCopy;
      document.getElementById('gate-coach-step').hidden = false;
      document.getElementById('gate-coach-step').innerHTML = '<p class="section-intro">Looking for a coach match…</p>';
    }
    if (typeof window.datafast === 'function') {
      window.datafast('event_alert_signup', { topic: topic, signed_up_from: sessionName || 'Alert form' });
    }
    matchCoach(record).then(function (coach) {
      if (!coach) {
        var root = document.getElementById(prefix === 'alert' ? 'coach-step' : 'gate-coach-step');
        root.hidden = true;
        root.innerHTML = '';
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
        signed_up_from: sessionName || 'Alert form'
      })
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok && data && data.ok, data: data }; });
    }).then(function (result) {
      if (!result.ok) {
        button.disabled = false;
        showError(messageEl, (result.data && result.data.message) || 'Something went wrong. Try again.');
        return;
      }
      record.id = result.data.id || '';
      record.email = email;
      record.name = name;
      showSaved(prefix, record, sessionName);
    }).catch(function () {
      button.disabled = false;
      showError(messageEl, 'Something went wrong. Try again.');
    });
  }

  function openGate(item) {
    document.getElementById('gate-title').textContent = item.name || '';
    document.getElementById('gate-when').textContent = item.when || '';
    document.getElementById('gate-host').textContent = item.host || '';
    document.getElementById('gate-skip').href = item.url;
    document.getElementById('gate-continue').href = item.url;
    gate.dataset.session = item.name || '';
    document.getElementById('gate-form').reset();
    document.getElementById('gate-form').hidden = false;
    clearError(document.getElementById('gate-message'));
    document.getElementById('gate-ask').hidden = false;
    document.getElementById('gate-done').hidden = true;
    document.getElementById('gate-coach-step').innerHTML = '';
    gateRecord.id = '';
    gateRecord.email = '';
    gate.hidden = false;
    gate.classList.add('is-open');
    document.title = (item.name || 'Session') + ' — Coach-Halo';
    document.getElementById('gate_first_name').focus();
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
