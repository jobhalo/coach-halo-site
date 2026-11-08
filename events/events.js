/* Keep slugs aligned with netlify/functions/events-lib.js */
(function () {
  var HUB = {
    headline: 'Find an event for your next step.',
    lead: 'Explore free online events on careers, relationships, money, wellbeing, and more. Choose a topic that matters to you.'
  };
  var TOPICS = {
    career: {
      label: 'careers',
      card: 'Career',
      blurb: 'Changing careers, interviews, and figuring out your next step.'
    },
    leadership: {
      label: 'leadership',
      card: 'Leadership',
      blurb: 'Leading a team, giving feedback, and growing in your role.'
    },
    business: {
      label: 'business',
      card: 'Business',
      blurb: 'Starting something, finding customers, and decisions as an owner.'
    },
    divorce: {
      label: 'divorce',
      card: 'Divorce',
      blurb: 'Separation, co-parenting, and what comes next.'
    },
    relationships: {
      label: 'relationships',
      card: 'Relationships',
      blurb: 'Communicating, trust, and hard seasons with someone you care about.'
    },
    habits: {
      label: 'wellbeing',
      card: 'Wellbeing',
      blurb: 'Everyday stress, routines, and making time for yourself.'
    },
    'financial-planning': {
      label: 'money',
      card: 'Money',
      blurb: 'Budgeting, money confidence, and your next financial step.'
    }
  };

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

  var parts = window.location.pathname.split('/').filter(Boolean);
  var topic = parts[0] === 'events' && parts[1] && TOPICS[parts[1]] ? parts[1] : '';
  var info = topic ? TOPICS[topic] : null;
  var pageTitle = document.title;
  var savedSignup = { id: '', email: '' };

  function topicWord() {
    if (topic === 'relationships') return 'relationship';
    return info ? info.label : 'workshop';
  }

  function nicheHeadline() {
    if (topic === 'relationships') return 'Free live relationship workshops.';
    return 'Free live ' + info.label + ' workshops.';
  }

  function track(name, props) {
    if (typeof window.datafast === 'function') window.datafast(name, props || {});
  }

  function showError(el, text) {
    el.textContent = text;
    el.className = 'message error';
  }

  function clearError(el) {
    el.textContent = '';
    el.className = 'message';
  }

  function emailOk(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function coachFirst(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'your coach';
  }

  /* Must match consentTextFor in netlify/functions/events-lib.js. */
  function consentTextFor(coachName) {
    var name = String(coachName || '').trim() || 'a coach';
    return (
      'I want Coach-Halo to introduce me to ' +
      name +
      ' and share my first name, email, topic, time zone, availability, and what I would like to talk about.'
    );
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

  function readWindows() {
    return [1, 2, 3].map(function (n) {
      var el = document.getElementById('connect-slot-' + n);
      return el ? windowFromLocal(el.value) : null;
    }).filter(Boolean);
  }

  function renderHub() {
    document.getElementById('events-side').hidden = true;
    document.getElementById('page-title').textContent = HUB.headline;
    document.getElementById('page-lead').textContent = HUB.lead;
    document.title = HUB.headline + ' — Coach-Halo';
    var list = document.getElementById('topic-list');
    Object.keys(TOPICS).forEach(function (slug) {
      var item = TOPICS[slug];
      var card = document.createElement('a');
      card.className = 'topic-card';
      card.href = '/events/' + slug + '/';
      var title = document.createElement('h2');
      title.textContent = item.card;
      var copy = document.createElement('p');
      copy.textContent = item.blurb;
      card.appendChild(title);
      card.appendChild(copy);
      list.appendChild(card);
    });
  }

  function renderNiche() {
    document.getElementById('eyebrow').textContent = info.card;
    document.getElementById('page-title').textContent = nicheHeadline();
    document.getElementById('page-lead').textContent = 'Explore upcoming online sessions, with dates and links to register.';
    document.title = nicheHeadline() + ' — Coach-Halo';
    pageTitle = document.title;
    document.getElementById('topic-list').hidden = true;
    document.getElementById('events-side').hidden = false;
    showSignup();
  }

  function showSignup() {
    var promise = document.getElementById('alert-promise');
    document.getElementById('alert-heading').textContent = 'Save your email';
    promise.hidden = false;
    promise.textContent = 'We’ll save your email for upcoming ' + topicWord() + ' workshops.';
    document.getElementById('alert-form').hidden = false;
  }

  function renderEvents(data) {
    var empty = document.getElementById('event-empty');
    var list = document.getElementById('event-list');
    showSignup();
    var events = data && data.ok && Array.isArray(data.events) ? data.events : [];
    if (!events.length) {
      empty.hidden = false;
      empty.textContent = 'No upcoming workshops listed right now.';
      list.hidden = true;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = '';
    events.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'event-card';
      var when = document.createElement('p');
      when.className = 'event-when';
      when.textContent = item.when ? item.when + ' PT' : '';
      var title = document.createElement('h2');
      title.textContent = item.name || 'Workshop';
      var host = document.createElement('p');
      host.className = 'event-host';
      host.textContent = item.host || '';
      card.appendChild(when);
      card.appendChild(title);
      if (item.host) card.appendChild(host);
      if (item.summary) {
        var summary = document.createElement('p');
        summary.className = 'event-summary';
        summary.textContent = item.summary;
        card.appendChild(summary);
      }
      if (item.free && item.online) {
        var cost = document.createElement('p');
        cost.className = 'event-cost';
        cost.textContent = 'Free · Live · Online';
      }
      if (item.free && item.online) card.appendChild(cost);
      if (item.url) {
        var link = document.createElement('a');
        link.className = 'btn-primary view-workshop';
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'View workshop';
        link.addEventListener('click', function () {
          track('workshop_outbound_click', { topic: topic, event_id: item.id || '' });
        });
        card.appendChild(link);
      }
      list.appendChild(card);
    });
  }

  function renderCoach(coach) {
    var block = document.getElementById('public-coach');
    if (!coach || !coach.name) {
      block.hidden = true;
      block.innerHTML = '';
      return;
    }
    block.hidden = false;
    block.innerHTML = '';
    var row = document.createElement('div');
    row.className = 'coach-row';
    var avatar = document.createElement('div');
    avatar.className = 'coach-avatar';
    var initial = document.createElement('span');
    initial.className = 'coach-avatar-fallback';
    initial.textContent = coach.name.trim().charAt(0).toUpperCase();
    avatar.appendChild(initial);
    if (coach.image) {
      var photo = document.createElement('img');
      photo.alt = '';
      photo.src = coach.image;
      photo.addEventListener('error', function () {
        photo.remove();
      });
      avatar.appendChild(photo);
      avatar.classList.add('has-photo');
      photo.addEventListener('error', function () {
        avatar.classList.remove('has-photo');
      });
    }
    var names = document.createElement('div');
    var name = document.createElement('div');
    name.className = 'coach-name-display';
    name.textContent = coach.name;
    names.appendChild(name);
    if (coach.line) {
      var line = document.createElement('div');
      line.className = 'coach-role-display';
      line.textContent = coach.line;
      names.appendChild(line);
    }
    row.appendChild(avatar);
    row.appendChild(names);
    block.appendChild(row);
    if (coach.profile_url) {
      var first = coach.name.trim().split(/\s+/)[0];
      var link = document.createElement('a');
      link.className = 'btn-secondary';
      link.href = coach.profile_url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Meet ' + first;
      link.addEventListener('click', function () {
        track('coach_profile_click', { topic: topic });
      });
      block.appendChild(link);
    }
    var connect = document.createElement('div');
    connect.id = 'coach-connect';
    connect.innerHTML = connectMarkup(coach);
    block.appendChild(connect);
    wireConnect(coach);
  }

  function connectMarkup(coach) {
    var first = coachFirst(coach.name);
    return (
      '<div id="connect-ask">' +
      '<div id="connect-actions">' +
      '<button type="button" class="btn-primary" id="connect-open">Connect with this coach</button>' +
      '<span class="coach-connect-note">Ask ' + esc(first) +
      ' for a free discovery call. We’ll introduce you by email.</span>' +
      '</div>' +
      '<form id="connect-form" class="coach-availability-block" hidden>' +
      '<p class="coach-availability-title">Preferred times for your call with ' + esc(first) + '</p>' +
      '<p class="coach-availability-lead">Choose your timezone, then add up to three date and time windows so we can coordinate.</p>' +
      '<p class="coach-availability-duration">Discovery calls are usually about <strong>30–45 minutes</strong>.</p>' +
      '<div id="connect-identity" hidden>' +
      '<div class="field-group"><label for="connect-name">First name</label>' +
      '<input type="text" id="connect-name" autocomplete="given-name" maxlength="60"></div>' +
      '<div class="field-group"><label for="connect-email">Email</label>' +
      '<input type="email" id="connect-email" autocomplete="email"></div>' +
      '<label class="check-row"><input type="checkbox" id="connect-newsletter">' +
      '<span class="check-label">Also email me new workshops on this topic.</span></label>' +
      '</div>' +
      '<div class="field-group"><label for="connect-tz">Your timezone</label>' +
      '<select id="connect-tz"></select></div>' +
      '<div class="field-group"><label for="connect-slot-1">Time window 1</label>' +
      '<input type="datetime-local" id="connect-slot-1"></div>' +
      '<div class="field-group"><label for="connect-slot-2">Time window 2 <span class="optional">(optional)</span></label>' +
      '<input type="datetime-local" id="connect-slot-2"></div>' +
      '<div class="field-group"><label for="connect-slot-3">Time window 3 <span class="optional">(optional)</span></label>' +
      '<input type="datetime-local" id="connect-slot-3"></div>' +
      '<div class="field-group"><label for="connect-note">In 1–2 sentences, what would you like to work on or talk with ' +
      esc(first) + ' about?</label>' +
      '<textarea id="connect-note" maxlength="600"></textarea></div>' +
      '<label class="check-row"><input type="checkbox" id="connect-consent">' +
      '<span class="check-label">' + esc(consentTextFor(coach.name)) + '</span></label>' +
      '<button type="submit" class="btn-primary">Send my introduction request</button>' +
      '<button type="button" class="link-quiet-coach" id="connect-back">Back</button>' +
      '<p class="message" id="connect-message" role="alert"></p>' +
      '</form></div>' +
      '<p class="signed-up-banner" id="connect-done" hidden></p>'
    );
  }

  function finishConnect(text) {
    document.getElementById('connect-ask').hidden = true;
    var done = document.getElementById('connect-done');
    done.hidden = false;
    done.textContent = text;
  }

  function wireConnect(coach) {
    var form = document.getElementById('connect-form');
    var actions = document.getElementById('connect-actions');
    var identity = document.getElementById('connect-identity');
    var select = document.getElementById('connect-tz');
    zoneOptions(select);

    document.getElementById('connect-open').addEventListener('click', function () {
      identity.hidden = !!savedSignup.id;
      form.hidden = false;
      actions.hidden = true;
      track('coach_connect_click', { topic: topic });
      (savedSignup.id ? select : document.getElementById('connect-name')).focus();
    });

    document.getElementById('connect-back').addEventListener('click', function () {
      form.hidden = true;
      actions.hidden = false;
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var message = document.getElementById('connect-message');
      clearError(message);

      var name = '';
      var email = savedSignup.email;
      if (!savedSignup.id) {
        var nameEl = document.getElementById('connect-name');
        var emailEl = document.getElementById('connect-email');
        name = nameEl.value.trim();
        email = emailEl.value.trim();
        if (!name) {
          showError(message, 'Add your first name so we can introduce you.');
          nameEl.focus();
          return;
        }
        if (!email || !emailOk(email)) {
          showError(message, 'Please enter a valid email address.');
          emailEl.focus();
          return;
        }
        if (window.jhSignupEmailProblem) {
          var emailProblem = window.jhSignupEmailProblem(email);
          if (emailProblem) {
            showError(message, emailProblem);
            emailEl.focus();
            return;
          }
        }
      }
      if (!select.value) {
        showError(message, 'Choose your time zone.');
        select.focus();
        return;
      }
      var windows = readWindows();
      if (!windows.length) {
        showError(message, 'Add at least one date and time that works for you.');
        document.getElementById('connect-slot-1').focus();
        return;
      }
      var noteEl = document.getElementById('connect-note');
      var coachMessage = noteEl.value.trim();
      if (coachMessage.length < 12) {
        showError(message, 'Add 1–2 sentences about what you’d like to work on.');
        noteEl.focus();
        return;
      }
      var consent = document.getElementById('connect-consent');
      if (!consent.checked) {
        showError(message, 'Check the box if you want Coach-Halo to make this introduction.');
        consent.focus();
        return;
      }

      var button = form.querySelector('button[type="submit"]');
      if (button.dataset.sending === '1') return;
      button.dataset.sending = '1';
      button.disabled = true;

      function release(text) {
        button.dataset.sending = '';
        button.disabled = false;
        showError(message, text || 'Something went wrong. Try again.');
      }

      function post(body) {
        return fetch('/.netlify/functions/save-event-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok && data && data.ok, data: data || {} };
          });
        });
      }

      function sendIntroduction() {
        return post({
          action: 'introduction',
          record_id: savedSignup.id,
          email: savedSignup.email,
          coach_name: coach.name,
          time_zone: select.value,
          windows: windows,
          coach_message: coachMessage,
          consent: true,
          consent_wording: consentTextFor(coach.name)
        }).then(function (result) {
          if (!result.ok) {
            release(result.data.message);
            return;
          }
          track('coach_intro_request', { topic: topic });
          finishConnect(
            result.data.intro_sent
              ? 'Your request is on its way to ' + coachFirst(coach.name) +
                  '. Watch your inbox. Those times are a preference, not a booked appointment.'
              : 'Your request is saved. Coach-Halo will follow up by email to set a time.'
          );
        });
      }

      var ready = savedSignup.id
        ? Promise.resolve(true)
        : post({
            action: 'alert',
            topic: topic,
            name: name,
            email: email,
            signed_up_from: 'Coach connect',
            want_newsletter: document.getElementById('connect-newsletter').checked,
            utm: window.__eventSignupUtm || {}
          }).then(function (result) {
            if (!result.ok || !result.data.id) {
              release(result.data.message);
              return false;
            }
            savedSignup = { id: result.data.id, email: email };
            return true;
          });

      ready
        .then(function (go) {
          if (go) return sendIntroduction();
        })
        .catch(function () {
          release();
        });
    });
  }

  function showSaved(isNew, welcomeSent) {
    document.getElementById('alert-form').hidden = true;
    document.getElementById('alert-done').hidden = false;
    document.getElementById('alert-done-title').textContent = isNew
      ? 'You’re on the list.'
      : 'This email is already saved.';
    document.getElementById('alert-done-copy').textContent = isNew
      ? welcomeSent
        ? 'Check your inbox for a welcome email about ' + topicWord() + ' workshops.'
        : 'It’s recorded for ' + topicWord() + ' workshops.'
      : 'This email was already saved for this topic.';
    document.title = pageTitle;
  }

  function submitAlert(event) {
    event.preventDefault();
    var form = event.target;
    var button = form.querySelector('button[type="submit"]');
    var messageEl = document.getElementById('alert-message');
    var email = document.getElementById('email').value.trim();
    clearError(messageEl);
    if (!email || !emailOk(email)) {
      showError(messageEl, 'Please enter a valid email address.');
      document.getElementById('email').focus();
      return;
    }
    if (window.jhSignupEmailProblem) {
      var emailProblem = window.jhSignupEmailProblem(email);
      if (emailProblem) {
        showError(messageEl, emailProblem);
        document.getElementById('email').focus();
        return;
      }
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
        email: email,
        signed_up_from: 'Category page',
        utm: window.__eventSignupUtm || {}
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
      var isNew = !(result.data && result.data.existing);
      if (isNew) track('weekly_events_signup_success', { topic: topic });
      if (result.data && result.data.id) savedSignup = { id: result.data.id, email: email };
      showSaved(isNew, !!(result.data && result.data.welcome_sent));
    }).catch(function () {
      button.dataset.sending = '';
      button.disabled = false;
      showError(messageEl, 'Something went wrong. Try again.');
    });
  }

  if (!topic) {
    renderHub();
  } else {
    renderNiche();
    document.getElementById('alert-form').addEventListener('submit', submitAlert);
    fetch('/.netlify/functions/fetch-events?topic=' + encodeURIComponent(topic))
      .then(function (res) { return res.json(); })
      .then(renderEvents)
      .catch(function () { renderEvents({ ok: false }); });
    fetch('/.netlify/functions/event-coach?topic=' + encodeURIComponent(topic))
      .then(function (res) { return res.json(); })
      .then(function (data) { renderCoach(data && data.coach); })
      .catch(function () { renderCoach(null); });
  }
})();
