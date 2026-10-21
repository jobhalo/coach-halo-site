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

  function coachFirst(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'your coach';
  }

  function topicChipLabel() {
    return (TOPICS[topic] && TOPICS[topic].label) || topic || '';
  }

  function fillSignupBanner(prefix, hasCoach) {
    var tail = document.getElementById(prefix + '-banner-tail');
    var chips = document.getElementById(prefix + '-topic-chip');
    var label = topicChipLabel();
    if (tail) tail.hidden = !hasCoach;
    if (chips) {
      chips.hidden = !hasCoach || !label;
      chips.innerHTML = hasCoach && label ? '<span>' + esc(label) + '</span>' : '';
    }
  }

  function coachMarkup(prefix, coach) {
    if (!coach || !coach.name) return '';
    var first = coachFirst(coach.name);
    var initial = String(coach.name).charAt(0).toUpperCase();
    var photo = coach.image
      ? '<img src="' + esc(coach.image) + '" alt="" width="56" height="56">'
      : '';
    var why = coach.line
      ? coach.line
      : 'Based on the topic you chose, ' + coach.name + ' is a strong match.';
    var role = coach.title || (TOPICS[topic] && TOPICS[topic].match && TOPICS[topic].match.coachingType) || '';
    var skip = prefix === 'gate'
      ? ''
      : '<button type="button" class="link-quiet-coach" id="' + prefix + '-skip">No thanks — just send me event alerts</button>';
    return (
      '<div class="coach-match-card">' +
      '<h3>Your matched coach</h3>' +
      '<p class="coach-why">' + esc(why) + '</p>' +
      '<div class="coach-row">' +
      '<div class="coach-avatar' + (coach.image ? ' has-photo' : '') + '">' +
      photo +
      '<span class="coach-avatar-fallback">' + esc(initial) + '</span>' +
      '</div>' +
      '<div class="coach-meta">' +
      '<div class="coach-name-display">' + esc(coach.name) + '</div>' +
      (role ? '<div class="coach-role-display">' + esc(role) + '</div>' : '') +
      '</div></div>' +
      '<div id="' + prefix + '-ask">' +
      '<div id="' + prefix + '-actions">' +
      '<button type="button" class="btn-primary" id="' + prefix + '-request">Connect me with ' +
      esc(first) + ' for a complimentary call</button>' +
      '<span class="coach-connect-note">I’ll make a quick email intro between you and ' +
      esc(first) + ' so you can connect and set up a time. It’s a free intro call.</span>' +
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
      '<button type="submit" class="btn-primary">Confirm &amp; send intro request</button>' +
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
    root.hidden = false;
    root.innerHTML = coachMarkup(prefix, coach);
    fillSignupBanner(prefix, true);
    var select = document.getElementById(prefix + '-tz');
    zoneOptions(select);
    document.getElementById(prefix + '-request').addEventListener('click', function () {
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
        finishCoach(prefix, 'We’ll email you when a free session in this topic is listed.');
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
          button.disabled = false;
          showError(message, (result.data && result.data.message) || 'Something went wrong. Try again.');
          return;
        }
        if (typeof window.datafast === 'function') {
          window.datafast('event_intro_request', { topic: topic });
        }
        finishCoach(prefix, 'Someone will email you to set a time. That time is a preference, not a booked appointment.');
      }).catch(function () {
        button.disabled = false;
        showError(message, 'Something went wrong. Try again.');
      });
    });
  }

  function showEventRegisterLink() {
    var cont = document.getElementById('gate-continue');
    if (!cont) return;
    var name = (gate.dataset.session || '').trim();
    cont.textContent = name
      ? 'Click here to register for ' + name
      : 'Click here to register for this session';
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
    var copy = document.getElementById(prefix === 'alert' ? 'alert-done-copy' : 'gate-done-copy');
    if (copy && prefix === 'alert') copy.textContent = ' ' + text;
    fillSignupBanner(prefix, false);
    var skip = document.getElementById(prefix + '-skip');
    if (skip) skip.hidden = true;
    if (prefix === 'gate') showEventRegisterLink();
  }

  function showSaved(prefix, record, sessionName) {
    var doneCopy = ' We’ll email you when a free session in this topic is listed. Check your email for a welcome note.';
    if (prefix === 'alert') {
      document.getElementById('alert').classList.add('is-done');
      document.getElementById('alert-form').hidden = true;
      document.getElementById('alert-done').hidden = false;
      document.getElementById('alert-done-copy').textContent = doneCopy;
      document.getElementById('coach-step').hidden = true;
      document.getElementById('coach-step').innerHTML = '';
      document.getElementById('coach-step').hidden = false;
    } else {
      document.getElementById('gate-ask').hidden = true;
      document.getElementById('gate-done').hidden = false;
      document.getElementById('gate-done-copy').textContent = doneCopy;
      document.getElementById('gate-coach-step').hidden = false;
      document.getElementById('gate-coach-step').innerHTML = '';
      hideEventRegisterLink();
    }
    fillSignupBanner(prefix, false);
    if (typeof window.datafast === 'function') {
      window.datafast('event_alert_signup', { topic: topic, signed_up_from: sessionName || 'Alert form' });
    }
    matchCoach(record).then(function (coach) {
      if (!coach) {
        var root = document.getElementById(prefix === 'alert' ? 'coach-step' : 'gate-coach-step');
        root.hidden = true;
        root.innerHTML = '';
        fillSignupBanner(prefix, false);
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
    document.getElementById('gate-skip').href = item.url;
    document.getElementById('gate-continue').href = item.url;
    gate.dataset.session = item.name || '';
    document.getElementById('gate-form').reset();
    document.getElementById('gate-form').hidden = false;
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
