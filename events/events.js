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

  var parts = window.location.pathname.split('/').filter(Boolean);
  var topic = parts[0] === 'events' && parts[1] && TOPICS[parts[1]] ? parts[1] : '';
  var info = topic ? TOPICS[topic] : null;
  var pageTitle = document.title;

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
