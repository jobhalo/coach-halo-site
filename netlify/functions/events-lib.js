/**
 * Shared rules for coach-halo.com/events.
 * Keep slugs aligned with events/index.html (TOPICS).
 */

const REF = 'coach-halo.com';
const WINDOW_MS = 35 * 24 * 60 * 60 * 1000;
const EARLIEST_PT_HOUR = 6;
const PT = 'America/Los_Angeles';
const COACH_NAME = 'Jake Randall';
const CONSENT_TEXT =
  'I want Coach-Halo to introduce me to Jake Randall and share my first name, email, topic, time zone, and availability.';

const TOPICS = {
  career: {
    label: 'Career change and job search',
    headline: 'Free sessions for a career change',
    lead: 'Live online sessions in the next five weeks for people changing careers or looking for work. Register with the host.',
  },
  leadership: {
    label: 'Leadership and the job you already have',
    headline: 'Free sessions for the job you already have',
    lead: 'Live online sessions in the next five weeks for people growing in the role they already have. Register with the host.',
  },
  business: {
    label: 'Starting or running a business',
    headline: 'Free sessions for starting or running a business',
    lead: 'Live online sessions in the next five weeks for people starting or running a business. Register with the host.',
  },
  divorce: {
    label: 'Divorce, separation, and dating again',
    headline: 'Free sessions for divorce, separation, and dating again',
    lead: 'Live online sessions in the next five weeks. Register with the host.',
  },
  relationships: {
    label: 'Relationships',
    headline: 'Free sessions for relationships',
    lead: 'Live online sessions in the next five weeks. Register with the host.',
  },
  habits: {
    label: 'Habits and a life reset',
    headline: 'Free sessions for habits and a life reset',
    lead: 'Live online sessions in the next five weeks for people changing habits or starting over. Register with the host.',
  },
  'financial-planning': {
    label: 'Personal financial planning',
    headline: 'Free sessions on personal financial planning',
    lead: 'Live online sessions in the next five weeks on budgets, money confidence, and long-term money habits. Register with the host.',
    coachName: COACH_NAME,
    coachLine: 'Works with people on budgets, money confidence, and long-term money habits.',
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
  const fields = {
    Name: input.name,
    Email: input.email,
    Topic: input.topic,
    'Heard from': 'events',
    'Signed up from': input.signedUpFrom || 'Alert form',
  };
  if (input.sessionNote) fields['Session note (do not share with coach)'] = input.sessionNote;
  return fields;
}

function introFields(input) {
  return {
    Coach: COACH_NAME,
    'Consent wording': CONSENT_TEXT,
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
