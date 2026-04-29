#!/usr/bin/env python3
"""
Rebuild the COACHES map in coach-portal.html from Airtable.

Reads the coaches table view (paid / portal-eligible coaches) and maps:
  - Contact Me           -> lookup key (email, lowercased)
  - Coach Name           -> name shown in the dashboard greeting
  - Update Profile URL   -> profile_form
  - Coach Dashboard      -> dashboard

Env:
  AIRTABLE_TOKEN (required)

Optional:
  COACH_HALO_SITE_HTML          full path to coach-portal.html (overrides auto-detect)
  COACH_HALO_SITE_DIR           directory containing coach-portal.html
  COACH_PORTAL_PROFILE_URL_MAX_LEN  if Update Profile URL exceeds this (default 2048),
                                    substitute a minimal name+email prefill link (long URLs often break in browsers)
  AIRTABLE_BASE_ID              default appYMfUftdmhlnU6q
  AIRTABLE_COACHES_TABLE_ID     default tblUGp4lLiJyABtzt
  AIRTABLE_COACH_PORTAL_VIEW_ID default viw2qFIMJEm5pr9Y3

Usage:
  From Thumbtack_coaching_agent (sibling ../coach-halo-site):  python3 update_ch_site.py
  From coach-halo-site repo:                                  python3 update_ch_site.py

Loads .env next to this script and ../coach-halo-site/.env when python-dotenv is installed.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv

    _here = Path(__file__).resolve().parent
    load_dotenv(_here / ".env")
    load_dotenv(_here.parent / "coach-halo-site" / ".env")
except ImportError:
    pass


def _resolve_coach_portal_html() -> Path:
    explicit = (os.getenv("COACH_HALO_SITE_HTML") or "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    d = (os.getenv("COACH_HALO_SITE_DIR") or "").strip()
    if d:
        return Path(d).expanduser().resolve() / "coach-portal.html"
    here = Path(__file__).resolve().parent
    next_to = here / "coach-portal.html"
    if next_to.is_file():
        return next_to
    return here.parent / "coach-halo-site" / "coach-portal.html"


DEFAULT_BASE = "appYMfUftdmhlnU6q"
DEFAULT_TABLE = "tblUGp4lLiJyABtzt"
DEFAULT_VIEW = "viw2qFIMJEm5pr9Y3"

F_EMAIL = "Contact Me"
F_NAME = "Coach Name"
F_PROFILE = "Update Profile URL"
F_DASHBOARD = "Coach Dashboard"

MARKER_START = "// <coach-portal-coaches-json-start>"
MARKER_END = "// <coach-portal-coaches-json-end>"

PROFILE_FORM_BASE = (
    "https://airtable.com/apppbUQrzMKIHnPUl/pagBXFAbn45Yq0O4d/form"
)


def _env(name: str, default: str) -> str:
    v = (os.getenv(name) or "").strip()
    return v if v else default


def _cell_str(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, str):
        return val.strip()
    if isinstance(val, dict):
        if "url" in val:
            return _cell_str(val.get("url"))
        if "email" in val:
            return _cell_str(val.get("email"))
    if isinstance(val, list) and val:
        return _cell_str(val[0])
    return str(val).strip()


def _fallback_profile_form_url(coach_name: str, email_for_prefill: str) -> str:
    pairs = [
        ("prefill_Full Name", coach_name),
        ("prefill_Email", email_for_prefill),
    ]
    q = urllib.parse.urlencode(pairs, quote_via=urllib.parse.quote)
    return f"{PROFILE_FORM_BASE}?{q}"


def _fetch_airtable_pages(
    token: str, base_id: str, table_id: str, view_id: str
) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    offset: Optional[str] = None
    while True:
        qs = f"?pageSize=100&view={urllib.parse.quote(view_id)}"
        if offset:
            qs += f"&offset={urllib.parse.quote(offset)}"
        url = f"https://api.airtable.com/v0/{base_id}/{table_id}{qs}"
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {token}"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise SystemExit(f"Airtable HTTP {e.code}: {body}") from e

        batch = payload.get("records") or []
        records.extend(batch)
        offset = payload.get("offset")
        if not offset:
            break
    return records


def _build_coaches_object(records: List[Dict[str, Any]]) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    dupes: List[str] = []

    for rec in records:
        fields = rec.get("fields") or {}
        raw_email = _cell_str(fields.get(F_EMAIL))
        if not raw_email:
            continue
        email = raw_email.lower()
        if email in out:
            dupes.append(email)
        name = _cell_str(fields.get(F_NAME)) or raw_email.split("@")[0]
        profile = _cell_str(fields.get(F_PROFILE))
        max_pf = int((os.getenv("COACH_PORTAL_PROFILE_URL_MAX_LEN") or "2048").strip() or "2048")
        if profile and len(profile) > max_pf:
            print(
                f"Warning: {F_PROFILE} for {email} is {len(profile)} chars (>{max_pf}); "
                "using minimal name+email prefill so the link works in browsers.",
                file=sys.stderr,
            )
            profile = _fallback_profile_form_url(name, raw_email)
        dash = _cell_str(fields.get(F_DASHBOARD))
        out[email] = {
            "name": name,
            "profile_form": profile,
            "dashboard": dash,
        }

    if dupes:
        print(
            "Warning: duplicate Contact Me emails in view (last row wins): "
            + ", ".join(sorted(set(dupes))),
            file=sys.stderr,
        )
    return out


def _render_coaches_js(coaches: Dict[str, Dict[str, str]]) -> str:
    lines = [MARKER_START, "    var COACHES = {"]
    for email in sorted(coaches.keys()):
        c = coaches[email]
        block = (
            f'      {json.dumps(email)}: '
            f'{{ name: {json.dumps(c["name"])}, '
            f"profile_form: {json.dumps(c['profile_form'])}, "
            f"dashboard: {json.dumps(c['dashboard'])} }}"
        )
        lines.append(block + ",")
    if lines[-1].endswith(","):
        lines[-1] = lines[-1][:-1]
    lines.append("    };")
    lines.append(f"    {MARKER_END}")
    return "\n".join(lines) + "\n"


def _patch_html(html_path: Path, html: str, new_block: str) -> str:
    if MARKER_START not in html or MARKER_END not in html:
        raise SystemExit(
            f"Missing markers in {html_path}. Add:\n  {MARKER_START}\n  ...\n  {MARKER_END}"
        )
    pattern = re.compile(
        re.escape(MARKER_START) + r".*?" + re.escape(MARKER_END),
        re.DOTALL,
    )
    if not pattern.search(html):
        raise SystemExit("Could not find coach-portal marker block to replace.")
    return pattern.sub(new_block.rstrip() + "\n", html, count=1)


def main() -> None:
    html_path = _resolve_coach_portal_html()
    if not html_path.is_file():
        raise SystemExit(
            f"coach-portal.html not found at {html_path}.\n"
            "Set COACH_HALO_SITE_HTML to the file path, or COACH_HALO_SITE_DIR to its folder."
        )

    token = (os.getenv("AIRTABLE_TOKEN") or "").strip()
    if not token:
        raise SystemExit("Set AIRTABLE_TOKEN to a personal access token with base read access.")

    base_id = _env("AIRTABLE_BASE_ID", DEFAULT_BASE)
    table_id = _env("AIRTABLE_COACHES_TABLE_ID", DEFAULT_TABLE)
    view_id = _env("AIRTABLE_COACH_PORTAL_VIEW_ID", DEFAULT_VIEW)

    records = _fetch_airtable_pages(token, base_id, table_id, view_id)
    coaches = _build_coaches_object(records)
    if not coaches:
        raise SystemExit("No rows with Contact Me set in this view.")

    new_block = _render_coaches_js(coaches)
    old = html_path.read_text(encoding="utf-8")
    updated = _patch_html(html_path, old, new_block)
    html_path.write_text(updated, encoding="utf-8")
    print(f"Updated {html_path} ({len(coaches)} coaches).")


if __name__ == "__main__":
    main()
