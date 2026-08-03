#!/usr/bin/env python3
"""Subset the bundled Inter Variable faces down to the glyphs this UI can render.

The shipped upstream files are the FULL Inter character set (352 KB roman,
388 KB italic) — Cyrillic, Greek, Vietnamese, hundreds of symbols, none of
which a `lang="en"` operations console ever paints. This script cuts them to
the Latin coverage the product actually needs, plus an explicit list of the
box-drawing / arrow / keyboard glyphs the UI hard-codes, which fall OUTSIDE a
stock "latin" subset and would otherwise render as tofu with no test to catch
it (spec §3.9, AC-11).

WHY A SCRIPT AND NOT A ONE-OFF COMMAND: the glyph set is derived from source,
so it has to be re-runnable whenever the UI grows a new symbol. `fonttools` is
deliberately NOT a repo dependency — this runs out of band, on demand, and the
subsetted .woff2 files are committed as build inputs.

USAGE (fonttools is not in package.json; install it out of band):

    python3 -m venv /tmp/fontvenv
    /tmp/fontvenv/bin/pip install 'fonttools[woff]'
    /tmp/fontvenv/bin/python scripts/subset-fonts.py

Pass `--check` to verify the CURRENT files in public/fonts/ without rewriting
them: it asserts every required codepoint is present in each face's `cmap` and
that the variable axes survived. That is the mechanical form of AC-11.

Originals are recoverable from git history (spec §11.1) — this overwrites the
files in place, so `git revert` of the commit restores the full faces.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

FONT_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"

# Unicode RANGES kept wholesale. Latin-1 Supplement and Latin Extended-A are in
# here even though `src/**` contains no accented letters today: resource names,
# channel names and operator names come from the BACKEND, and an operator
# called "Müller" or a resource named "São Paulo edge" must not tofu. They are
# a rounding error in bytes and they remove a whole class of future defect.
UNICODE_RANGES = [
    (0x0020, 0x007E),  # Basic Latin (printable ASCII)
    (0x00A0, 0x00FF),  # Latin-1 Supplement — accented names from backend data
    (0x0100, 0x017F),  # Latin Extended-A — ditto (Š, ł, ő, ...)
    (0x2018, 0x201F),  # curly quotes — used in confirm copy: “{name}” will ...
    (0x2010, 0x2015),  # hyphen/en dash/em dash — `—` alone appears 1000+ times
]

# Individual codepoints the UI hard-codes. Every one of these was derived by
# scanning `src/**` for non-ASCII; the comment says where it renders. Entries
# marked "comments only" are kept anyway because they cost ~nothing and the
# distinction between "in a comment" and "in JSX" is one refactor away.
EXTRA_CODEPOINTS = {
    0x00A7: "§ — spec cross-references (comments)",
    0x00B1: "± — view-range docs (comments)",
    0x00B5: "µ — perf notes (comments)",
    0x00B7: "· — meta separators, e.g. `MNT-1042 · 14 Mar 16:00`",
    0x00D7: "× — dimension notation in comments",
    0x2022: "• — bullet lists in CSS/JSX comments",
    0x2026: "… — ellipsis in truncated labels",
    0x203A: "› — hover-revealed row affordance (notify-channels list)",
    0x2190: "← — `← Previous` pagination button (audit log)",
    0x2192: "→ — audit diff rows `old → new`, and everywhere in comments",
    0x2194: "↔ — bidirectional labels (`Create ↔ edit dialog`)",
    0x21B3: "↳ — continuation marker on multi-day calendar event bars",
    0x21B5: "↵ — Enter key hint (<Kbd>) in the component showcase",
    0x2205: "∅ — empty-value placeholder in audit expanded diff",
    0x2212: "− — minus sign in role diff pills (`−removed`)",
    0x2248: "≈ — approximate timings in perf comments",
    0x2260: "≠ — inequality in contract comments",
    0x2264: "≤ — range copy (`≤90-day window`) and comments",
    0x2265: "≥ — validation copy (`duration ≥ 5 min`, `≥1 channel`)",
    0x2318: "⌘ — Command key hint (<Kbd>) in the component showcase",
    0x26A0: "⚠ — warning marker in test copy",
}

# Codepoints the UI uses that INTER ITSELF DOES NOT CONTAIN. Verified against
# the unsubsetted upstream files (352 KB roman / 388 KB italic): all four are
# absent from their `cmap`, so they already fall through to the system fallback
# stack (`ui-sans-serif, system-ui, -apple-system, ...`) on every render TODAY,
# before any subsetting. Requesting them from the subsetter is a silent no-op.
#
# They are listed rather than deleted because AC-11 names them explicitly: the
# check below asserts they are absent from BOTH the original and the subset, so
# the acceptance criterion is answered with evidence ("unchanged, still served
# by fallback") instead of being quietly dropped. If a future font upgrade adds
# them upstream, move them into EXTRA_CODEPOINTS so the subset keeps them.
NOT_IN_INTER = {
    0x21C4: "⇄ — redirect-loop notation (comments only, never rendered)",
    0x2500: "─ — section rules in JSX/CSS comments (never rendered)",
    0x25BE: "▾ — `Custom range ▾` popover trigger (audit log) — RENDERED",
    0x2715: "✕ — remove-row button in the step editor — RENDERED",
}

# Layout features to preserve. `tnum`/`zero` are load-bearing: globals.css sets
# `font-feature-settings: "tnum", "zero"` on mono/tabular numerics, and the
# default subsetter feature list would drop them, silently un-aligning every
# numeric column.
LAYOUT_FEATURES = [
    "kern",
    "liga",
    "clig",
    "calt",
    "ccmp",
    "locl",
    "mark",
    "mkmk",
    "rlig",
    "tnum",
    "zero",
    "frac",
    "sups",
    "subs",
    "ss01",
    "ss02",
    "ss03",
    "cv01",
    "cv02",
]

FACES = ["InterVariable.woff2", "InterVariable-Italic.woff2"]


def required_codepoints() -> set[int]:
    cps: set[int] = set(EXTRA_CODEPOINTS)
    for start, end in UNICODE_RANGES:
        cps.update(range(start, end + 1))
    return cps


def subset_face(path: Path, cps: set[int]) -> tuple[int, int]:
    """Subset one face in place. Returns (bytes_before, bytes_after)."""
    from fontTools import subset
    from fontTools.ttLib import TTFont

    before = path.stat().st_size

    font = TTFont(path)
    options = subset.Options()
    options.flavor = "woff2"
    # Keep the variable-font machinery. Dropping `fvar`/`gvar`/`avar`/`STAT`
    # would pin the face at wght=400 while the CSS still claims `100 900`, so
    # every bold heading would silently render at regular weight.
    options.retain_gids = False
    options.layout_features = LAYOUT_FEATURES
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    options.recalc_timestamp = False
    options.drop_tables = []
    options.legacy_kern = False
    options.hinting = False

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=cps)
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(path)
    font.close()

    return before, path.stat().st_size


def check_face(path: Path, cps: set[int]) -> list[str]:
    """Assert coverage + variable axes on the file as it stands. AC-11."""
    from fontTools.ttLib import TTFont

    problems: list[str] = []
    font = TTFont(path)
    cmap = font.getBestCmap()

    # Only the hard-coded UI glyphs are a hard failure — an unmapped codepoint
    # inside a bulk range (e.g. an unassigned Latin-1 slot) is expected.
    missing = sorted(cp for cp in EXTRA_CODEPOINTS if cp not in cmap)
    if missing:
        joined = ", ".join(f"U+{cp:04X} {chr(cp)}" for cp in missing)
        problems.append(f"{path.name}: missing UI glyphs: {joined}")

    ascii_missing = sorted(cp for cp in range(0x0020, 0x007F) if cp not in cmap)
    if ascii_missing:
        problems.append(f"{path.name}: missing printable ASCII: {ascii_missing}")

    # The converse check: these must stay absent. If one ever turns up here it
    # means the font was swapped for a wider one, and the note above is stale.
    unexpected = sorted(cp for cp in NOT_IN_INTER if cp in cmap)
    if unexpected:
        joined = ", ".join(f"U+{cp:04X} {chr(cp)}" for cp in unexpected)
        problems.append(f"{path.name}: {joined} now IN the font — move to EXTRA_CODEPOINTS")

    if "fvar" not in font:
        problems.append(f"{path.name}: fvar table gone — no longer a variable font")
    else:
        axes = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}
        if axes.get("wght") != (100.0, 900.0):
            problems.append(f"{path.name}: wght axis is {axes.get('wght')}, expected (100, 900)")
        if "opsz" not in axes:
            problems.append(f"{path.name}: opsz axis gone")
    for table in ("gvar", "HVAR", "avar"):
        if table not in font:
            problems.append(f"{path.name}: {table} table gone — variations will break")

    covered = sum(1 for cp in cps if cp in cmap)
    print(f"  {path.name}: {path.stat().st_size:,} B, {len(cmap)} cmap entries, {covered} required covered")
    font.close()
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify only; do not rewrite")
    args = parser.parse_args()

    cps = required_codepoints()
    print(f"Required codepoints: {len(cps)}")

    if not args.check:
        for name in FACES:
            before, after = subset_face(FONT_DIR / name, cps)
            pct = (1 - after / before) * 100
            print(f"  {name}: {before:,} B -> {after:,} B ({pct:.1f}% smaller)")

    print("Verifying (AC-11):")
    problems: list[str] = []
    for name in FACES:
        problems += check_face(FONT_DIR / name, cps)

    if problems:
        for p in problems:
            print(f"FAIL {p}", file=sys.stderr)
        return 1
    print("OK: every UI glyph present, variable axes intact.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
