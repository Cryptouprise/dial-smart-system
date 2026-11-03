"""Repair scripts/ship/_extract_app.py: drop the broken GHL_SUBS literal and load
the substitution table from _ghl_subs.json instead."""
import io

P = "scripts/ship/_extract_app.py"
src = io.open(P, "r", encoding="utf-8", newline="").read()

# --- 1. import json -------------------------------------------------------
if "\nimport json\n" not in src:
    src = src.replace("\nimport io\n", "\nimport io\nimport json\n", 1)

# --- 2. drop the comment + GHL_SUBS literal ------------------------------
a = src.index("# DoorBoss was written against GoHighLevel:")
b = src.index("BLOCK_RE = re.compile(")
assert src[a:b].rstrip().endswith(")"), repr(src[a:b][-40:])
src = src[:a] + src[b:]

# --- 3. swap seam_ghl for the JSON-loading version -----------------------
NEW = "\n".join([
    "def seam_ghl(body: str) -> tuple[str, str]:",
    "    '''Make GoHighLevel optional instead of assumed. Returns (code, notes).",
    "",
    "    DoorBoss assumes GoHighLevel everywhere it touches an appointment or a rep record.",
    "    Dial Smart does not need it, so every one of those sites is gated on CONFIG.ghl,",
    "    which the host sets (false by default, true for a client who really runs on GHL).",
    "    The replacements live in _ghl_subs.json, next to this file, so the exact DoorBoss",
    "    wording never has to survive a round trip through Python quoting. Each one asserts",
    "    exactly one occurrence: a DoorBoss release that changes this wording stops the",
    "    extraction here instead of shipping the old promise.",
    "    '''",
    "    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_ghl_subs.json')",
    "    with io.open(path, 'r', encoding='utf-8') as fh:",
    "        subs = json.load(fh)",
    "    for old, new in subs:",
    "        n = body.count(old)",
    "        if n != 1:",
    "            raise SystemExit('ghl: expected exactly 1 occurrence of %r, found %d' % (old[:70], n))",
    "        body = body.replace(old, new)",
    "    return body, 'GoHighLevel optional (%d sites gated on CONFIG.ghl)' % len(subs)",
    "",
    "",
])

c = src.index("def seam_ghl(body: str) -> tuple[str, str]:")
d = src.index("def main() -> int:")
assert src[c:d].rstrip().endswith("return body, \"; \".join(notes)"), repr(src[c:d][-60:])
src = src[:c] + NEW + src[d:]

io.open(P, "w", encoding="utf-8", newline="").write(src)
print("patched", P, len(src), "bytes")
