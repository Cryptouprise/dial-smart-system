"""Prove the old live bundle was pre-bug-4 and the new one is post-bug-4, using the exact strings
that commit da242c46 added/removed.  python _marker_voice.py
"""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BEFORE = os.path.join(os.environ["TEMP"], "voice-bodies-before")
AFTER = os.path.join(os.environ["TEMP"], "voice-bodies-after")
SLUGS = ["voice-call", "voice-call-action", "voice-call-events", "voice-token"]
# (label, bytes, expected in OLD, expected in NEW)
MARKERS = [
    ("module-scope REGISTRY (removed by da242c46)", b"const REGISTRY: Record<VoiceProvider, BrowserPhoneProvider>", True, False),
    ("REGISTRY[name] (old lookup)", b"REGISTRY[name]", True, False),
    ("providerRegistry (added by da242c46)", b"providerRegistry", False, True),
    # Not a discriminator: the definition moved from voice-provider.ts to public-url.ts, so the
    # same signature appears in both bundles (it is a leaf definition in the new one).
    ("publicFunctionsBaseUrl signature", b"export function publicFunctionsBaseUrl", None, None),
    ("public-url.ts leaf import (new)", b"public-url.ts", None, None),
]

print("== bug-4 markers inside the deployed bundles")
print("   %-46s %s" % ("marker", "  ".join("%-11s" % s[:11] for s in SLUGS)))
for label, needle, exp_old, exp_new in MARKERS:
    row = []
    for slug in SLUGS:
        old = open(os.path.join(BEFORE, slug + ".eszip"), "rb").read()
        new = open(os.path.join(AFTER, slug + ".eszip"), "rb").read()
        co, cn = old.count(needle), new.count(needle)
        verdict = ""
        if exp_old is not None:
            verdict = "OK" if (bool(co) == exp_old and bool(cn) == exp_new) else "!!"
        row.append("%d/%d %s" % (co, cn, verdict))
    print("   %-46s %s" % (label[:46], "  ".join("%-11s" % x for x in row)))

print()
print("== control: the same markers in the local source (post-fix, should match the NEW bundle)")
root = r"C:\Users\charl\dial-smart-system\supabase\functions\_shared"
src = (open(os.path.join(root, "voice-provider.ts"), encoding="utf-8").read() +
       open(os.path.join(root, "twilio.ts"), encoding="utf-8").read() +
       open(os.path.join(root, "public-url.ts"), encoding="utf-8").read()).encode("utf-8")
for label, needle, _, _ in MARKERS:
    print("   %-46s %d" % (label[:46], src.count(needle)))
