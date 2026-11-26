#!/usr/bin/env python3
"""Write one Friday workshop HTML draft from live Coach-Halo Events.

Reads Live rows, drops events that the category page would hide, and dedupes
URLs. Does not call Outseta, send mail, or schedule a broadcast. Paste the
HTML into a manual Outseta broadcast to the events list and send it on Friday.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "netlify" / "functions" / "event-coach-map.json"
EVENTS_TABLE = "tblJJVVYNwDwP28R2"
DIRECTORY_TABLE = "tblUGp4lLiJyABtzt"
BASE_ID = "appYMfUftdmhlnU6q"
PT = ZoneInfo("America/Los_Angeles")
WINDOW = timedelta(days=35)

TOPICS = [
    ("career", "Careers"),
    ("leadership", "Leadership"),
    ("business", "Business"),
    ("divorce", "Divorce"),
    ("relationships", "Relationships"),
    ("habits", "Wellbeing"),
    ("financial-planning", "Money"),
]


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text().splitlines():
        text = line.strip()
        if not text or text.startswith("#") or "=" not in text:
            continue
        key, value = text.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def airtable_get(token: str, url: str) -> dict:
    request = Request(url, headers={"Authorization": f"Bearer {token}"})
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def live_rows(token: str, base_id: str) -> list[dict]:
    rows = []
    offset = ""
    while True:
        url = (
            f"https://api.airtable.com/v0/{base_id}/{EVENTS_TABLE}"
            "?filterByFormula=" + "%7BLive%7D%3D1" + "&pageSize=100"
        )
        if offset:
            url += "&offset=" + offset
        data = airtable_get(token, url)
        rows.extend(data.get("records") or [])
        offset = data.get("offset") or ""
        if not offset:
            return rows


def parse_start(value: str) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def on_page(start: datetime, now: datetime) -> bool:
    if start <= now or start > now + WINDOW:
        return False
    hour = start.astimezone(PT).hour
    return 6 <= hour <= 23


def with_ref(raw: str) -> str:
    parts = urlsplit(raw.strip())
    if parts.scheme not in ("http", "https"):
        return raw.strip()
    query = parse_qsl(parts.query, keep_blank_values=True)
    if not any(key == "ref" and value == "coach-halo.com" for key, value in query):
        query.append(("ref", "coach-halo.com"))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def url_key(raw: str) -> str:
    try:
        parts = urlsplit(raw.strip())
    except ValueError:
        return ""
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return ""
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


def format_when(start: datetime) -> str:
    local = start.astimezone(PT)
    hour = local.strftime("%I").lstrip("0") or "12"
    minute = local.strftime("%M")
    clock = hour + (" " + local.strftime("%p") if minute == "00" else ":" + minute + " " + local.strftime("%p"))
    return local.strftime("%a, %b ") + str(local.day) + " · " + clock + " PT"


def coach_line(token: str, base_id: str, topic: str) -> str:
    try:
        mapping = json.loads(MAP_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return ""
    record_id = str(mapping.get(topic) or "").strip()
    if not record_id.startswith("rec"):
        return ""
    url = f"https://api.airtable.com/v0/{base_id}/{DIRECTORY_TABLE}/{record_id}"
    try:
        data = airtable_get(token, url)
    except Exception:
        return ""
    name = str((data.get("fields") or {}).get("Coach Name") or "").strip()
    return name


def section(title: str, events: list[dict], coach: str) -> str:
    if not events:
        return ""
    items = []
    for event in events:
        bits = [
            f"<li><strong>{escape(event['name'])}</strong>",
            f"<br>{escape(event['when'])}",
        ]
        if event["host"]:
            bits.append(f"<br>{escape(event['host'])}")
        bits.append(f'<br><a href="{escape(event["url"], quote=True)}">View workshop</a></li>')
        items.append("".join(bits))
    coach_html = f"<p>Coach: {escape(coach)}</p>" if coach else ""
    return f"<h2>{escape(title)}</h2>{coach_html}<ul>{''.join(items)}</ul>"


def build(now: datetime | None = None) -> str:
    load_env()
    token = (os.environ.get("AIRTABLE_PAT") or os.environ.get("AIRTABLE_TOKEN") or "").strip()
    if not token:
        raise SystemExit("AIRTABLE_PAT is missing. No email was drafted.")
    base_id = (os.environ.get("AIRTABLE_BASE_ID") or BASE_ID).strip()
    moment = now or datetime.now(timezone.utc)
    seen = set()
    grouped = {slug: [] for slug, _label in TOPICS}
    for row in live_rows(token, base_id):
        fields = row.get("fields") or {}
        topic = str(fields.get("Topic") or "").strip()
        if topic not in grouped:
            continue
        start = parse_start(str(fields.get("Start") or ""))
        if not start or not on_page(start, moment):
            continue
        raw_url = str(fields.get("URL") or "").strip()
        key = url_key(raw_url)
        if not key or key in seen:
            continue
        seen.add(key)
        grouped[topic].append(
            {
                "name": str(fields.get("Name") or "Workshop").strip(),
                "host": str(fields.get("Host") or "").strip(),
                "url": with_ref(raw_url),
                "when": format_when(start),
                "start": start,
            }
        )
    parts = [
        "<p>Free live online workshops for the coming week. Each link registers you on the organizer’s site.</p>"
    ]
    for slug, label in TOPICS:
        events = sorted(grouped[slug], key=lambda item: item["start"])
        parts.append(section(label, events, coach_line(token, base_id, slug)))
    body = "".join(part for part in parts if part)
    if body == parts[0]:
        body += "<p>No upcoming workshops listed right now.</p>"
    return (
        "<!DOCTYPE html><html><body>"
        "<p>Friday workshops from Coach-Halo.</p>"
        f"{body}"
        "<p>Unsubscribe from this email anytime.</p>"
        "</body></html>"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Draft a Friday events email. Does not send it.")
    parser.add_argument(
        "--output",
        default=str(ROOT / "scripts" / "output" / "friday-events-sample.html"),
    )
    args = parser.parse_args()
    html = build()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    print(f"Wrote {output}")
    print(
        "Paste this HTML into a manual Outseta broadcast to the events list and send it on Friday. "
        "This script did not call the broadcast API and did not schedule a send."
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        print(f"Draft failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
