/**
 * Coach-Halo events welcome email, sent through SendGrid after a new
 * Event Alerts row is created. One email per new email + topic.
 *
 * Env: SENDGRID_API_KEY, optional SENDGRID_FROM_EMAIL,
 * optional EVENT_UNSUBSCRIBE_SECRET (falls back to the Airtable token).
 */

const crypto = require('crypto');

const SITE = 'https://coach-halo.com';
const FROM_DEFAULT = 'joaquinh@coach-halo.com';

const COPY = {
  career: {
    label: 'career',
    opener: 'You signed up for free online workshops about changing careers, interviews, and figuring out your next step.',
  },
  leadership: {
    label: 'leadership',
    opener: 'You signed up for free online workshops about leading a team, giving feedback, and growing into a bigger role.',
  },
  business: {
    label: 'business',
    opener: 'You signed up for free online workshops about starting something, finding customers, and making decisions as an owner.',
  },
  divorce: {
    label: 'divorce and separation',
    opener: 'You signed up for free online workshops about separation, co-parenting, and what comes next. Whatever brought you here, you don’t have to figure it out alone.',
    note: 'These workshops are educational and aren’t legal advice. If you need help with a legal question, talk to a family-law attorney where you live.',
  },
  relationships: {
    label: 'relationship',
    opener: 'You signed up for free online workshops about communicating better, rebuilding trust, and getting through a hard season with someone you care about.',
    note: 'These workshops are educational and aren’t therapy. If you’re in crisis or feel unsafe, call or text 988 in the US.',
  },
  habits: {
    label: 'wellbeing',
    opener: 'You signed up for free online workshops about everyday stress, building routines, and making time for yourself.',
  },
  'financial-planning': {
    label: 'money',
    opener: 'You signed up for free online workshops about budgeting, building money confidence, and taking your next financial step.',
    note: 'These workshops are educational and aren’t financial, tax, or investment advice.',
  },
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unsubscribeSecret() {
  return String(
    process.env.EVENT_UNSUBSCRIBE_SECRET || process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN || ''
  ).trim();
}

function unsubscribeToken(recordId) {
  const secret = unsubscribeSecret();
  if (!secret) return '';
  return crypto
    .createHmac('sha256', secret)
    .update('event-unsubscribe:' + String(recordId || ''))
    .digest('hex')
    .slice(0, 32);
}

function validUnsubscribeToken(recordId, token) {
  const want = unsubscribeToken(recordId);
  const got = String(token || '');
  if (!want || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

function unsubscribeUrl(recordId) {
  return (
    SITE +
    '/.netlify/functions/event-unsubscribe?id=' +
    encodeURIComponent(recordId) +
    '&t=' +
    unsubscribeToken(recordId)
  );
}

function topicPageUrl(topic) {
  return (
    SITE +
    '/events/' +
    topic +
    '/?utm_source=sendgrid&utm_medium=email&utm_campaign=events_welcome&utm_content=' +
    encodeURIComponent(topic)
  );
}

function p(html) {
  return '<p style="margin:0 0 16px;font-size:16px;line-height:25px;color:#0a0a0a;">' + html + '</p>';
}

function welcomeEmail(topic, recordId) {
  const copy = COPY[topic];
  if (!copy) return null;
  const subject = 'You’re on the list for free ' + copy.label + ' workshops';
  const page = topicPageUrl(topic);
  const unsub = unsubscribeUrl(recordId);
  const tag = (copy.label + ' workshops').toUpperCase();

  const body =
    p('👋 Hi, I’m Joaquin, creator of Coach-Halo.') +
    p(escapeHtml(copy.opener)) +
    p('When I find a free, live, online workshop on this topic, I’ll send it your way. Each one links straight to the host’s registration page. You don’t need to sign up through us.') +
    p('In the meantime, here’s what’s listed right now: <a href="' + escapeHtml(page) + '" style="color:#0a0a0a;font-weight:600;text-decoration:underline;">See upcoming ' + escapeHtml(copy.label) + ' workshops</a>') +
    p('✅ <strong>Quick tip.</strong> If you use Gmail, drag this email to your Primary tab, so the next one doesn’t get buried.') +
    (copy.note ? p(escapeHtml(copy.note)) : '');

  const html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>' + escapeHtml(subject) + '</title></head>' +
    '<body style="margin:0;padding:0;width:100%;background-color:#fafafa;font-family:Arial,Helvetica,sans-serif;color:#0a0a0a;">' +
    '<div style="display:none;font-size:1px;color:#fafafa;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Free, live, online ' + escapeHtml(copy.label) + ' workshops, sent your way.</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fafafa"><tr><td align="center" style="padding:36px 16px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;border:1px solid #e8e8e8;">' +
    '<tr><td style="padding:27px 36px;border-top:3px solid #0a0a0a;border-bottom:1px solid #e8e8e8;">' +
    '<table role="presentation" width="100%"><tr><td><a href="' + SITE + '" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;letter-spacing:2.8px;color:#0a0a0a;text-decoration:none;">COACH-HALO</a></td>' +
    '<td align="right" style="font-size:11px;letter-spacing:1.5px;color:#6b6b6b;">' + escapeHtml(tag) + '</td></tr></table></td></tr>' +
    '<tr><td style="padding:30px 36px 8px;">' + body + '</td></tr>' +
    '<tr><td style="padding:12px 36px 30px;"><p style="margin:0;font-size:14px;line-height:22px;color:#0a0a0a;">Joaquin<br><span style="font-size:12px;color:#6b6b6b;">Creator of Coach-Halo.com</span></p></td></tr>' +
    '<tr><td style="padding:20px 36px;border-top:1px solid #e8e8e8;"><a href="' + escapeHtml(unsub) + '" style="font-size:12px;line-height:20px;color:#6b6b6b;text-decoration:underline;">Unsubscribe</a></td></tr>' +
    '</table>' +
    '<table role="presentation" width="100%" style="max-width:600px;"><tr><td align="center" style="padding:19px 20px 0;font-size:11px;line-height:18px;color:#6b6b6b;">You’re receiving this because you signed up for ' + escapeHtml(copy.label) + ' workshops at <a href="' + SITE + '/events/" style="color:#6b6b6b;text-decoration:underline;">coach-halo.com/events</a>.</td></tr></table>' +
    '</td></tr></table></body></html>';

  const text = [
    'Hi, I’m Joaquin, creator of Coach-Halo.',
    copy.opener,
    'When I find a free, live, online workshop on this topic, I’ll send it your way. Each one links straight to the host’s registration page. You don’t need to sign up through us.',
    'See upcoming ' + copy.label + ' workshops: ' + page,
    'Quick tip: if you use Gmail, drag this email to your Primary tab, so the next one doesn’t get buried.',
    copy.note || '',
    'Joaquin\nCreator of Coach-Halo.com',
    'Unsubscribe: ' + unsub,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { subject, html, text, unsubscribeUrl: unsub };
}

async function sendWelcome(email, topic, recordId) {
  const apiKey = String(process.env.SENDGRID_API_KEY || '').trim();
  const fromAddr = String(process.env.SENDGRID_FROM_EMAIL || FROM_DEFAULT).trim();
  if (!apiKey.startsWith('SG.') || !fromAddr.toLowerCase().endsWith('@coach-halo.com')) {
    return { sent: false, reason: 'not_configured' };
  }
  if (!unsubscribeSecret()) return { sent: false, reason: 'not_configured' };
  const mail = welcomeEmail(topic, recordId);
  if (!mail) return { sent: false, reason: 'topic' };
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: email }] }],
      from: { email: fromAddr, name: 'Joaquin @ Coach-Halo' },
      reply_to: { email: fromAddr, name: 'Joaquin @ Coach-Halo' },
      subject: mail.subject,
      content: [
        { type: 'text/plain', value: mail.text },
        { type: 'text/html', value: mail.html },
      ],
      headers: {
        'List-Unsubscribe': '<' + mail.unsubscribeUrl + '>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      categories: ['ch_event_welcome', 'ch_event_welcome_' + topic],
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: true },
      },
    }),
  });
  if (!res.ok) {
    console.log('event welcome status', res.status);
    return { sent: false, reason: 'send_failed' };
  }
  return { sent: true };
}

module.exports = {
  COPY,
  welcomeEmail,
  sendWelcome,
  unsubscribeToken,
  validUnsubscribeToken,
};
