#!/usr/bin/env python3
"""Fast source-integrity checks for the static AI-WasteTwin project."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app.js"
INDEX = ROOT / "index.html"
README = ROOT / "README.md"

def require(condition, message):
    if not condition:
        raise AssertionError(message)
    print(f"PASS: {message}")

def main():
    for path in (APP, INDEX, README, ROOT / "styles.css"):
        require(path.is_file(), f"required file exists: {path.relative_to(ROOT)}")
    app = APP.read_text(encoding="utf-8")
    html = INDEX.read_text(encoding="utf-8")
    readme = README.read_text(encoding="utf-8")

    require("Not measured" in app and "Fixed schedule" in app,
            "analytics clearly marks the fixed-schedule baseline as unmeasured")
    require("state.routeDistance*1.3" not in app and "fixedDelay=m.avgTime*1.35" not in app,
            "fabricated fixed-schedule metric multipliers are absent")
    require("Math.max(state.overflowIncidents+Math.ceil(m.overflow/15),state.overflowIncidents)" not in app,
            "fabricated overflow-incidence adjustment is absent")
    require("const wasOverflowed=b.fill>=100" in app and "if(!wasOverflowed&&b.fill>=100)overflowEvents++" in app,
            "Decision Lab counts a bin's first overflow crossing, not every full tick")
    require("function simulateDecisionCopy" in app and "overflowEvents" in app,
            "Decision Lab projection and overflow metric remain present")
    require("src=\"app.js\"" in html and "href=\"styles.css\"" in html,
            "HTML loads the expected local JS and CSS files")
    require("not yet measured" in readme.lower() and "equivalent cloned city states" in readme.lower(),
            "README documents baseline limitation and fair-comparison requirement")

    # Verify local script/style links in the HTML (ignore remote URLs, data URLs,
    # fragment links, and generated SVG data attributes).
    for attr, value in re.findall(r'\b(src|href)=[\"\']([^\"\']+)[\"\']', html):
        if value.startswith(("http://", "https://", "data:", "#", "mailto:", "javascript:")):
            continue
        local = (ROOT / value.split("?", 1)[0].split("#", 1)[0])
        if local.suffix.lower() in {".js", ".css"}:
            require(local.is_file(), f"local asset referenced by HTML exists: {value}")

    print("\nAll static source-integrity checks passed.")

if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
