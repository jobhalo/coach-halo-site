#!/usr/bin/env python3
"""Build a word-level redline (old vs new) of the coach-facing legal pages for review.

Usage: python3 scripts/legal-redline.py OUT.html old_coach_terms old_privacy old_disclaimer
New versions are read from this folder. The output must not be placed inside the site.
"""
import difflib
import html
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOCKS = {"h1", "h2", "h3", "p", "li"}


class Blocks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_main = False
        self.depth = 0
        self.cur = None
        self.out = []

    def handle_starttag(self, tag, attrs):
        if tag == "main":
            self.in_main = True
        if self.in_main and tag in BLOCKS and self.cur is None:
            self.cur = [tag, []]

    def handle_endtag(self, tag):
        if self.cur is not None and tag == self.cur[0]:
            text = re.sub(r"\s+", " ", "".join(self.cur[1])).strip()
            if text:
                self.out.append((self.cur[0], text))
            self.cur = None
        if tag == "main":
            self.in_main = False

    def handle_data(self, data):
        if self.cur is not None:
            self.cur[1].append(data)


def blocks(path):
    p = Blocks()
    p.feed(Path(path).read_text(encoding="utf-8"))
    return p.out


def words_diff(a, b):
    aw, bw = a.split(" "), b.split(" ")
    out = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, aw, bw, autojunk=False).get_opcodes():
        if op == "equal":
            out.append(html.escape(" ".join(aw[i1:i2])))
        if op in ("delete", "replace"):
            out.append("<del>" + html.escape(" ".join(aw[i1:i2])) + "</del>")
        if op in ("insert", "replace"):
            out.append("<ins>" + html.escape(" ".join(bw[j1:j2])) + "</ins>")
    return " ".join(out)


def render(tag, inner, cls=""):
    t = tag if tag in ("h1", "h2", "h3") else "p"
    prefix = "• " if tag == "li" else ""
    return f'<{t} class="{cls}">{prefix}{inner}</{t}>'


def redline(old_path, new_path):
    old, new = blocks(old_path), blocks(new_path)
    sm = difflib.SequenceMatcher(None, [t for _, t in old], [t for _, t in new], autojunk=False)
    parts, changed = [], 0
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            for tag, text in old[i1:i2]:
                parts.append(render(tag, html.escape(text), "same"))
            continue
        changed += 1
        if op == "replace" and (i2 - i1) == (j2 - j1):
            for (tag, a), (_, b) in zip(old[i1:i2], new[j1:j2]):
                parts.append(render(tag, words_diff(a, b), "chg"))
            continue
        for tag, text in old[i1:i2]:
            parts.append(render(tag, "<del>" + html.escape(text) + "</del>", "chg"))
        for tag, text in new[j1:j2]:
            parts.append(render(tag, "<ins>" + html.escape(text) + "</ins>", "chg"))
    return "\n".join(parts), changed


def main():
    out, old_terms, old_privacy, old_disclaimer = sys.argv[1:5]
    docs = [
        ("Coach Terms of Service", old_terms, ROOT / "coach-terms/index.html"),
        ("Privacy Policy", old_privacy, ROOT / "privacy/index.html"),
        ("Disclaimer", old_disclaimer, ROOT / "disclaimer/index.html"),
    ]
    sections = []
    for title, old, new in docs:
        body, changed = redline(old, new)
        sections.append(f'<section><h1 class="doc">{html.escape(title)} <small>{changed} changed passages</small></h1>{body}</section>')
    Path(out).write_text(
        """<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Coach-Halo legal redlines: affiliate migration</title>
<style>
body{font-family:-apple-system,system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 20px;line-height:1.6;color:#222}
.doc{border-top:3px solid #111;padding-top:18px;margin-top:48px}.doc small{font-size:.55em;color:#777;font-weight:400}
del{background:#fde2e2;color:#9b1c1c}ins{background:#dcfce7;color:#14532d;text-decoration:none}
.same{color:#888}.chg{color:#111}h2.same,h3.same{color:#555}
.top{background:#fff7ed;border:1px solid #fed7aa;padding:12px 16px;border-radius:6px}
label{font-size:.9rem}
</style></head><body>
<div class="top"><strong>Draft for review. Not legal advice.</strong> Red strikethrough is removed text; green is new text. Unchanged text is grey.
<label style="margin-left:12px"><input type="checkbox" onchange="document.querySelectorAll('.same').forEach(e=>e.hidden=this.checked)"> Show changes only</label></div>
""" + "\n".join(sections) + "</body></html>",
        encoding="utf-8",
    )
    print("wrote", out)


if __name__ == "__main__":
    main()
