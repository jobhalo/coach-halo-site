/**
 * Shared rules for coach-halo.com/events.
 * Keep slugs aligned with events/index.html (TOPICS).
 */

const REF = 'coach-halo.com';
const WINDOW_MS = 35 * 24 * 60 * 60 * 1000;
const EARLIEST_PT_HOUR = 6;
const PT = 'America/Los_Angeles';
const COACH_NAME = 'Jake Randall';

const TOPICS = {
  career: {
    label: 'careers',
    blurb: 'Changing careers, interviews, and figuring out your next step.',
    headline: 'Free online events about careers and your next step.',
    lead: 'Explore changing careers, preparing for interviews, and figuring out what comes next.',
    example: 'For example, changing careers, preparing for interviews, or figuring out your next step.',
    match: {
      coachingType: 'Career coaching',
      coachingTypeCategory: 'Career Coaching',
      goals: 'Career change and job search',
    },
  },
  leadership: {
    label: 'leadership',
    blurb: 'Leading a team, giving feedback, and growing in your role.',
    headline: 'Free online events about leadership.',
    lead: 'Explore leading a team, giving feedback, and growing into a bigger role.',
    example: 'For example, leading a team, giving feedback, or stepping into a bigger role.',
    match: {
      coachingType: 'Career coaching',
      coachingTypeCategory: 'Career Coaching',
      goals: 'Leadership and growing in the job I already have',
    },
  },
  business: {
    label: 'business',
    blurb: 'Starting something, finding customers, and decisions as an owner.',
    headline: 'Free online events about running a business.',
    lead: 'Explore starting something, finding customers, and making decisions as an owner.',
    example: 'For example, starting a business, finding customers, or making your next decision.',
    match: {
      coachingType: 'Career coaching',
      coachingTypeCategory: 'Career Coaching',
      goals: 'Starting or running a business',
    },
  },
  divorce: {
    label: 'divorce',
    blurb: 'Separation, co-parenting, and what comes next.',
    headline: 'Free online events about divorce and separation.',
    lead: 'Explore separation, co-parenting, and what comes next.',
    example: 'For example, navigating a separation, co-parenting, or figuring out what comes next.',
    match: {
      coachingType: 'Life coaching',
      coachingTypeCategory: 'Life Coaching',
      goals: 'Divorce, separation, and dating again',
    },
  },
  relationships: {
    label: 'relationships',
    blurb: 'Communicating, trust, and hard seasons with someone you care about.',
    headline: 'Free online events about relationships.',
    lead: 'Explore communicating better, rebuilding trust, and navigating a hard season.',
    example: 'For example, communicating better, rebuilding trust, or navigating a breakup.',
    match: {
      coachingType: 'Relationship & marriage',
      coachingTypeCategory: 'Marriage and Relationship Counseling',
      goals: 'Relationships and communication',
    },
  },
  habits: {
    label: 'wellbeing',
    blurb: 'Everyday stress, routines, and making time for yourself.',
    headline: 'Free online events about wellbeing.',
    lead: 'Explore managing everyday stress, building routines, and making time for yourself.',
    example: 'For example, managing everyday stress, building routines, or making time for yourself.',
    match: {
      coachingType: 'Life coaching',
      coachingTypeCategory: 'Life Coaching',
      goals: 'Habits and a life reset',
    },
  },
  'financial-planning': {
    label: 'money',
    blurb: 'Budgeting, money confidence, and your next financial step.',
    headline: 'Free online events about money and financial wellbeing.',
    lead: 'Explore budgeting, building money confidence, and taking your next financial step.',
    example: 'For example, managing debt, building money confidence, or knowing where to start.',
    coachName: COACH_NAME,
    coachLine: 'Helps young professionals pay off their debt in half the time.',
    match: {
      coachingType: 'Financial wellness',
      coachingTypeCategory: 'Personal Financial Planning',
      goals: 'Budgets, money confidence, and long-term money habits',
      fixedCoachName: COACH_NAME,
    },
  },
};

const TIME_ZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/New_York',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Puerto_Rico',
];

function consentTextFor(coachName) {
  const name = String(coachName || '').trim() || 'a coach';
  return (
    'I want Coach-Halo to introduce me to ' +
    name +
    ' and share my first name, email, topic, time zone, and availability.'
  );
}

const CONSENT_TEXT = consentTextFor(COACH_NAME);

function welcomeSubject() {
  return 'You’re on the Coach-Halo event list';
}

function welcomeBody(name, topicLabel) {
  const topic = String(topicLabel || 'this topic').trim();
  return [
    '👋 Hi there! I’m Joaquin, creator of Coach-Halo.',
    'You’re on the event list. I’ll email you when a free online event fits the topic you chose' +
      (topic && topic !== 'this topic' ? ' (' + topic + ')' : '') +
      '.',
    'We use that topic to find events that fit what you’re looking for.',
    '✅ **Quick tip.** Drag this email to your Primary inbox if you are on Gmail, or mark it as Not Spam, so the event notes don’t get buried.',
    'Thanks for letting Coach-Halo be part of your journey.',
    'Joaquin, Creator of Coach-Halo.com',
  ].join('\n\n');
}

function withCoachHaloRef(raw) {
  const url = String(raw || '').trim();
  if (!url) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  if (parsed.searchParams.get('ref') !== REF) parsed.searchParams.set('ref', REF);
  return parsed.toString();
}

function pacificHour(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PT,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour');
  return hour ? Number(hour.value) : NaN;
}

function startsInWindow(iso, now) {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return false;
  if (start.getTime() < now.getTime()) return false;
  if (start.getTime() > now.getTime() + WINDOW_MS) return false;
  const hour = pacificHour(start);
  return hour >= EARLIEST_PT_HOUR && hour <= 23;
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: PT,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: PT,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return day + ' · ' + time.replace(':00', '');
}

function topicSlug(value) {
  const slug = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(TOPICS, slug) ? slug : '';
}

function isValidTimeZone(timeZone) {
  const zone = String(timeZone || '').trim();
  if (!zone) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

function zonedDateTime(dateText, timeText, timeZone) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || '').trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeText || '').trim());
  if (!dateMatch || !timeMatch || !isValidTimeZone(timeZone)) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  for (let i = 0; i < 4; i += 1) {
    const parts = Object.fromEntries(
      fmt
        .formatToParts(new Date(utc))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value])
    );
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute)
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute);
    const delta = desired - asUtc;
    if (delta === 0) break;
    utc += delta;
  }
  const check = fmt.formatToParts(new Date(utc));
  const got = Object.fromEntries(
    check.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );
  if (
    Number(got.year) !== year ||
    Number(got.month) !== month ||
    Number(got.day) !== day ||
    Number(got.hour) !== hour ||
    Number(got.minute) !== minute
  ) {
    return null;
  }
  return new Date(utc);
}

function availabilityFromWindows(windows, timeZone, now) {
  if (!Array.isArray(windows) || windows.length < 1 || windows.length > 3) {
    return { ok: false, message: 'Add one to three times that work for you.' };
  }
  const lines = [];
  for (const window of windows) {
    const item = window || {};
    const start = zonedDateTime(item.date, item.start, timeZone);
    const end = zonedDateTime(item.date, item.end, timeZone);
    if (!start || !end) return { ok: false, message: 'Enter a date, start time, and end time.' };
    if (end.getTime() <= start.getTime()) {
      return { ok: false, message: 'The end time needs to be after the start time.' };
    }
    if (start.getTime() <= now.getTime()) {
      return { ok: false, message: 'Choose a time in the future.' };
    }
    lines.push(
      String(item.date).trim() +
        ' ' +
        String(item.start).trim() +
        '–' +
        String(item.end).trim() +
        ' ' +
        timeZone
    );
  }
  return { ok: true, text: lines.join('\n') };
}

function alertFields(input) {
  const topic = topicSlug(input.topic);
  const info = TOPICS[topic] || {};
  const subject = welcomeSubject();
  const body = welcomeBody(input.name, info.label || topic);
  const sourceParts = [input.signedUpFrom || 'Category page'];
  if (input.eventId) sourceParts.push(String(input.eventId).trim());
  if (input.eventUrl) sourceParts.push(String(input.eventUrl).trim());
  const fields = {
    Name: input.name,
    Email: input.email,
    Topic: topic,
    'Heard from': 'events',
    'Signed up from': sourceParts.filter(Boolean).join(' | ').slice(0, 500),
    'Event welcome subject': subject,
    'Event welcome body': body,
    'Send event welcome': 'Yes',
  };
  if (input.sessionNote) fields['Session note (do not share with coach)'] = input.sessionNote;
  return fields;
}

function introFields(input) {
  const coachName = String(input.coachName || COACH_NAME).trim() || COACH_NAME;
  return {
    Coach: coachName,
    'Consent wording': consentTextFor(coachName),
    'Consent time': input.consentTime,
    'Request status': 'Requested',
    'Time zone': input.timeZone,
    Availability: input.availabilityText,
  };
}

module.exports = {
  REF,
  WINDOW_MS,
  EARLIEST_PT_HOUR,
  PT,
  COACH_NAME,
  CONSENT_TEXT,
  TOPICS,
  TIME_ZONES,
  consentTextFor,
  welcomeSubject,
  welcomeBody,
  withCoachHaloRef,
  pacificHour,
  startsInWindow,
  formatWhen,
  topicSlug,
  isValidTimeZone,
  zonedDateTime,
  availabilityFromWindows,
  alertFields,
  introFields,
};
