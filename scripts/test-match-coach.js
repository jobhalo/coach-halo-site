#!/usr/bin/env node
/** Local smoke test: AIRTABLE_TOKEN=... node scripts/test-match-coach.js */
const handler = require('../netlify/functions/match-coach.js').handler;

const event = {
  httpMethod: 'POST',
  body: JSON.stringify({
    coachingTypeCategory: 'Marriage and Relationship Counseling',
    coachingType: 'Relationship & marriage',
    genderPreference: 'No preference',
    goals: 'testing my marriage communication',
    style: 'Supportive and reflective',
  }),
};

handler(event).then((res) => {
  console.log(res.statusCode, JSON.parse(res.body));
});
