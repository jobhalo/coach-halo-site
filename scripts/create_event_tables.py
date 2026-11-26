#!/usr/bin/env python3
"""Create Coach-Halo Events and Coach-Halo Event Alerts in base appYMfUftdmhlnU6q.

The local Airtable tokens used by the agents can read some tables and cannot
change schema. Run this with a token that has schema.bases:write on that base:

  AIRTABLE_PAT=... python3 scripts/create_event_tables.py

Prints the two table ids to set as Netlify env:
  CH_EVENTS_TABLE_ID
  CH_EVENT_ALERTS_TABLE_ID
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE = "appYMfUftdmhlnU6q"
TOPICS = [
    "career",
    "leadership",
    "business",
    "divorce",
    "relationships",
    "habits",
    "financial-planning",
]


def request(token: str, method: str, url: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.load(res)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()[:500]
        raise SystemExit(f"{method} {url} failed ({exc.code}): {body}") from exc


def choices(names: list[str]) -> list[dict]:
    return [{"name": name} for name in names]


def main() -> None:
    token = (os.environ.get("AIRTABLE_PAT") or os.environ.get("AIRTABLE_TOKEN") or "").strip()
    if not token:
        raise SystemExit("Set AIRTABLE_PAT to a token with schema.bases:write.")
    existing = request(token, "GET", f"https://api.airtable.com/v0/meta/bases/{BASE}/tables")
    by_name = {table.get("name"): table.get("id") for table in existing.get("tables", [])}
    specs = [
        (
            "Coach-Halo Events",
            [
                {"name": "Name", "type": "singleLineText"},
                {"name": "URL", "type": "url"},
                {
                    "name": "Start",
                    "type": "dateTime",
                    "options": {
                        "dateFormat": {"name": "iso"},
                        "timeFormat": {"name": "24hour"},
                        "timeZone": "America/Los_Angeles",
                    },
                },
                {"name": "Host", "type": "singleLineText"},
                {"name": "Summary", "type": "multilineText"},
                {"name": "Topic", "type": "singleSelect", "options": {"choices": choices(TOPICS)}},
                {"name": "Live", "type": "checkbox", "options": {"icon": "check", "color": "greenBright"}},
            ],
        ),
        (
            "Coach-Halo Event Alerts",
            [
                {"name": "Name", "type": "singleLineText"},
                {"name": "Email", "type": "email"},
                {"name": "Topic", "type": "singleSelect", "options": {"choices": choices(TOPICS)}},
                {"name": "Session note (do not share with coach)", "type": "multilineText"},
                {"name": "Heard from", "type": "singleLineText"},
                {"name": "Signed up from", "type": "singleLineText"},
                {"name": "Coach", "type": "singleLineText"},
                {"name": "Consent wording", "type": "multilineText"},
                {
                    "name": "Consent time",
                    "type": "dateTime",
                    "options": {
                        "dateFormat": {"name": "iso"},
                        "timeFormat": {"name": "24hour"},
                        "timeZone": "utc",
                    },
                },
                {
                    "name": "Request status",
                    "type": "singleSelect",
                    "options": {"choices": choices(["Requested"])},
                },
                {"name": "Time zone", "type": "singleLineText"},
                {"name": "Availability", "type": "multilineText"},
            ],
        ),
    ]
    for name, fields in specs:
        if name in by_name:
            print(f"{name} {by_name[name]} existing")
            continue
        created = request(
            token,
            "POST",
            f"https://api.airtable.com/v0/meta/bases/{BASE}/tables",
            {"name": name, "fields": fields},
        )
        print(f"{name} {created.get('id')} created")


if __name__ == "__main__":
    main()
