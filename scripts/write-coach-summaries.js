#!/usr/bin/env node
/**
 * Writes the inline coach summaries shown in the event page coach block.
 *
 * Reads the coaches already mapped in netlify/functions/event-coach-map.json,
 * sends only their own profile answers to gpt-4o, and stores the result in
 * netlify/functions/event-coach-summaries.json. Run by hand and read the
 * output before committing. Committing is the publish step.
 *
 * Usage:
 *   node scripts/write-coach-summaries.js [--dry-run] [--force]
 *
 * Env: OPENAI_API_KEY, AIRTABLE_PAT or AIRTABLE_TOKEN,
 * optional AIRTABLE_BASE_ID, optional CH_DIRECTORY_TABLE_ID,
 * optional OPENAI_SUMMARY_MODEL (default gpt-4o).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const MAP_PATH = path.join(ROOT, 'netlify', 'functions', 'event-coach-map.json');
const OUT_PATH = path.join(ROOT, 'netlify', 'functions', 'event-coach-summaries.json');
const DEFAULT_BASE = 'appYMfUftdmhlnU6q';
const DEFAULT_DIRECTORY = 'tblUGp4lLiJyABtzt';
const DEFAULT_MODEL = 'gpt-4o';

const CAPS = { summary: 320, ideal_client: 160, offer: 160 };

const SOURCE_FIELDS = {
  title: 'Coach title',
  about: 'About Me & My Practice',
  ideal: 'Tell us about your ideal client',
  approach: 'Describe your coaching approach and style in one short paragraph.',
  result:
    'What specific result do your ideal clients typically achieve after working with you, and in what timeframe?',
};

const SYSTEM_PROMPT = [
  'You write short, plain summaries of coaches for Coach-Halo event pages.',
  '',
  'Rules:',
  '- Use only the profile text provided. Invent nothing.',
  '- Never add credentials, certifications, numbers, prices, timeframes, or outcomes that are not in the text.',
  '- Write in the third person. Never use quotation marks, so nothing reads as a direct quote from the coach.',
  '- No guarantees and no promises of results.',
  '- Never describe the work as therapy, medical care, legal help, or investment advice.',
  '- If a source field is empty, return an empty string for that key. Never guess.',
  '',
  'Return JSON with exactly these keys:',
  '- summary: at most 2 sentences and 320 characters, what this coach does.',
  '- ideal_client: at most 160 characters, who they work with. Empty string when the ideal client field is empty.',
  '- offer: at most 160 characters, what they help people do. Empty string when both the result and approach fields are empty.',
].join('\n');

function clean(value, max) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max || 1200);
}

function truncate(value, max) {
  const text = String(value || '')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '').trim();
}

function sourceFor(fields) {
  return {
    title: clean(fields[SOURCE_FIELDS.title], 160),
    about: clean(fields[SOURCE_FIELDS.about], 1800),
    ideal: clean(fields[SOURCE_FIELDS.ideal], 800),
    approach: clean(fields[SOURCE_FIELDS.approach], 600),
    result: clean(fields[SOURCE_FIELDS.result], 800),
  };
}

function sourceHash(name, source) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ name, source }))
    .digest('hex')
    .slice(0, 16);
}

async function directoryRecord(recordId) {
  const token = process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN || '';
  if (!token) throw new Error('Set AIRTABLE_PAT or AIRTABLE_TOKEN');
  const baseId = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE;
  const tableId = process.env.CH_DIRECTORY_TABLE_ID || DEFAULT_DIRECTORY;
  const url =
    'https://api.airtable.com/v0/' +
    baseId +
    '/' +
    encodeURIComponent(tableId) +
    '/' +
    encodeURIComponent(recordId);
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('Airtable ' + res.status + ' for ' + recordId);
  const data = await res.json();
  return data.fields || {};
}

async function writeSummary(name, source) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('Set OPENAI_API_KEY');
  const facts = [
    'Coach name: ' + name,
    source.title ? 'Their title: ' + source.title : 'Their title: (empty)',
    source.about ? 'About their practice: ' + source.about : 'About their practice: (empty)',
    source.ideal ? 'Their ideal client: ' + source.ideal : 'Their ideal client: (empty)',
    source.approach ? 'Their approach: ' + source.approach : 'Their approach: (empty)',
    source.result ? 'Results they describe: ' + source.result : 'Results they describe: (empty)',
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_SUMMARY_MODEL || DEFAULT_MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: facts },
      ],
    }),
  });
  if (!res.ok) throw new Error('OpenAI ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return {
    summary: truncate(parsed.summary, CAPS.summary),
    ideal_client: source.ideal ? truncate(parsed.ideal_client, CAPS.ideal_client) : '',
    offer: source.result || source.approach ? truncate(parsed.offer, CAPS.offer) : '',
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const existing = fs.existsSync(OUT_PATH) ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) : {};

  const ids = [];
  for (const [slug, id] of Object.entries(map)) {
    const recordId = String(id || '').trim();
    if (!recordId) {
      console.log('skip ' + slug + ': no coach mapped');
      continue;
    }
    if (!ids.includes(recordId)) ids.push(recordId);
  }

  const out = {};
  for (const recordId of ids) {
    const fields = await directoryRecord(recordId);
    const name = clean(fields['Coach Name'], 80);
    if (!name) {
      console.log('skip ' + recordId + ': no Coach Name');
      continue;
    }
    const source = sourceFor(fields);
    const hash = sourceHash(name, source);
    const prior = existing[recordId];

    if (!force && prior && prior.source_hash === hash) {
      out[recordId] = prior;
      console.log('\n' + name + ' (' + recordId + ') unchanged, kept');
      continue;
    }

    const written = await writeSummary(name, source);
    out[recordId] = Object.assign({ name }, written, {
      generated: new Date().toISOString().slice(0, 10),
      source_hash: hash,
    });

    console.log('\n' + name + ' (' + recordId + ')');
    console.log('  summary: ' + written.summary);
    console.log('  ideal_client: ' + (written.ideal_client || '(none, field empty)'));
    console.log('  offer: ' + (written.offer || '(none, fields empty)'));
  }

  const sorted = {};
  for (const key of Object.keys(out).sort()) sorted[key] = out[key];
  if (dryRun) {
    console.log('\nDry run. Nothing written.');
    return;
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 2) + '\n');
  console.log('\nWrote ' + Object.keys(sorted).length + ' summaries to ' + path.relative(ROOT, OUT_PATH));
  console.log('Read them above, then commit to publish.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(String(err.message || err));
    process.exit(1);
  });
}

module.exports = {
  CAPS,
  SOURCE_FIELDS,
  SYSTEM_PROMPT,
  clean,
  truncate,
  sourceFor,
  sourceHash,
  directoryRecord,
};
