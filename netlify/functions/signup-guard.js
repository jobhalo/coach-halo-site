/**
 * Blocks obvious joke names and undeliverable joke emails on Job-Halo signup.
 * Whole tokens only (butt blocks butt.com, not butler.com or button.com).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.jhSignupEmailProblem = api.jhSignupEmailProblem;
    root.jhSignupNameProblem = api.jhSignupNameProblem;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var JOKE = {
    fart: 1,
    butt: 1,
    poop: 1,
    poo: 1,
    shit: 1,
    asshole: 1,
    fuck: 1,
    bitch: 1,
    crap: 1,
    anus: 1,
    porn: 1,
    xxx: 1,
    penis: 1,
    pussy: 1,
    boob: 1,
    boobs: 1,
    tits: 1,
    wtf: 1,
    lmao: 1,
    asdf: 1,
    qwerty: 1,
    fake: 1,
    nobody: 1,
    nope: 1,
    test: 1,
    testing: 1,
    asdfgh: 1
  };

  var DISPOSABLE_DOMAINS = {
    'mailinator.com': 1,
    'guerrillamail.com': 1,
    'guerrillamailblock.com': 1,
    'sharklasers.com': 1,
    'yopmail.com': 1,
    'tempmail.com': 1,
    '10minutemail.com': 1,
    'trashmail.com': 1,
    'getnada.com': 1,
    'mailnesia.com': 1,
    'dispostable.com': 1,
    'fakeinbox.com': 1,
    'example.com': 1,
    'example.org': 1,
    'example.net': 1,
    'test.com': 1,
    'invalid.com': 1
  };

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var EMAIL_MSG = 'Use an email address you can actually receive mail at.';
  var NAME_MSG = 'Use your real name.';

  function tokens(raw) {
    return String(raw || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  function isJoke(token) {
    return !!JOKE[token];
  }

  function jhSignupNameProblem(name) {
    var parts = tokens(name);
    if (!parts.length) return '';
    for (var i = 0; i < parts.length; i++) {
      if (isJoke(parts[i])) return NAME_MSG;
    }
    return '';
  }

  function jhSignupEmailProblem(email) {
    var raw = String(email || '').trim().toLowerCase();
    if (!raw) return '';
    if (!EMAIL_RE.test(raw)) return 'Please enter a valid email address.';
    var at = raw.lastIndexOf('@');
    var local = raw.slice(0, at);
    var domain = raw.slice(at + 1);
    if (DISPOSABLE_DOMAINS[domain]) return EMAIL_MSG;
    var localBase = local.split('+')[0];
    var localParts = tokens(localBase);
    for (var i = 0; i < localParts.length; i++) {
      if (isJoke(localParts[i])) return EMAIL_MSG;
    }
    var labels = domain.split('.');
    for (var j = 0; j < labels.length - 1; j++) {
      var labelParts = tokens(labels[j]);
      for (var k = 0; k < labelParts.length; k++) {
        if (isJoke(labelParts[k])) return EMAIL_MSG;
      }
    }
    return '';
  }

  return {
    jhSignupEmailProblem: jhSignupEmailProblem,
    jhSignupNameProblem: jhSignupNameProblem
  };
});
