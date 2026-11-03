"""Build scripts/ship/_ghl_subs.json from the pristine DoorBoss source.

Quotes are built with chr() so no escaping can be lost in transit, and every needle is
verified to occur exactly once in the pristine HTML before it is written.
"""
import io
import json
import os

Q = chr(34)   # "
A = chr(39)   # '
B = chr(96)   # `
M = chr(183)  # middle dot

SRC = os.path.join("docs", "wholesale", "doorboss-app", "index.prod.html")
OUT = os.path.join("scripts", "ship", "_ghl_subs.json")

# 0. the app documents the switch itself
S0 = (
    "const CONFIG = {",
    "const CONFIG = { ghl: false, /* GoHighLevel is optional; the host sets true for a client on GHL */",
)

# 1. the appointment card promised a GHL calendar this app does not have
S1 = (
    " " + M + " ${ap.ghl_event_id?" + A + "on the GHL calendar" + A + ":" + A + "syncing to GHL calendar" + A + "}",
    "${CONFIG.ghl?(ap.ghl_event_id?" + A + " " + M + " on the GHL calendar" + A + ":" + A + " " + M + " syncing to GHL calendar" + A + "):" + A + A + "}",
)

# 2. the whole "GHL sync" card, hidden while GHL is off
S2 = (
    "<div class=" + Q + "card stack" + Q + "><h3 style=" + Q + "font-size:18px" + Q + ">GHL sync</h3>",
    "<div class=" + Q + "card stack" + Q + " style=" + Q + "${CONFIG.ghl?" + A + A + ":" + A + "display:none" + A + "}" + Q + "><h3 style=" + Q + "font-size:18px" + Q + ">GHL sync</h3>",
)

# 3. the rep list's "GHL linked / no GHL user" status
S3 = (
    "${u.ghl_user_id?" + A + " " + M + " GHL linked" + A + ":" + A + " " + M + " <span style=" + Q + "color:var(--warn)" + Q + ">no GHL user</span>" + A + "}",
    "${CONFIG.ghl?(u.ghl_user_id?" + A + " " + M + " GHL linked" + A + ":" + A + " " + M + " <span style=" + Q + "color:var(--warn)" + Q + ">no GHL user</span>" + A + "):" + A + A + "}",
)

# 4. the "GHL user id" field in the rep editor
S4 = (
    "<label class=" + Q + "f" + Q + ">GHL user id<input type=" + Q + "text" + Q + " id=" + Q + "eu_ghl" + Q + " value=" + Q + "${esc(u.ghl_user_id||" + A + A + ")}" + Q + " placeholder=" + Q + "matched by email on login" + Q + "></label>",
    "${CONFIG.ghl?" + A + "<label class=" + Q + "f" + Q + ">GHL user id<input type=" + Q + "text" + Q + " id=" + Q + "eu_ghl" + Q + " value=" + Q + A + "+esc(u.ghl_user_id||" + A + A + ")+" + A + Q + " placeholder=" + Q + "matched by email on login" + Q + "></label>" + A + ":" + A + A + "}",
)

# 5. the intake guard that would block every rep without a GHL user id
S5 = (
    "if (!A.me.ghl_user_id) return toast(",
    "if (CONFIG.ghl && !A.me.ghl_user_id) return toast(",
)

# 6. the rep save reads that field, which is not rendered while GHL is off
S6 = (
    "ghl_user_id:$(" + A + "#eu_ghl" + A + ").value.trim()",
    "ghl_user_id:(CONFIG.ghl?$(" + A + "#eu_ghl" + A + ").value.trim():(u.ghl_user_id||" + A + A + "))",
)

# 7. the pin detail's "GHL Contact linked" badge: only a GHL install ever sets that id, but a row
# left over from one must not show the badge on a standalone install
S7 = (
    "${p.ghl_contact_id?" + B + "<b>GHL</b><span>Contact linked</span>" + B + ":" + A + A + "}",
    "${CONFIG.ghl&&p.ghl_contact_id?" + B + "<b>GHL</b><span>Contact linked</span>" + B + ":" + A + A + "}",
)

# 8. the intake confirm promised it "adds them to GHL" whatever the install
S8 = (
    "and adds them to GHL, assigned to you. Do this when you are sitting down with them.",
    "and " + A + "+(CONFIG.ghl?" + A + "adds them to GHL" + A + ":" + A + "files them in the portal" + A + ")+" + A + ", assigned to you. Do this when you are sitting down with them.",
)

# 9. the after-call toast said "and GHL updated" / "GHL not updated" on every install
S9 = (
    "(g.updated ? " + A + " and GHL updated" + A + " : (g.reason ? " + A + ". GHL not updated: " + A + " + String(g.reason).slice(0, 70) : " + A + A + "))",
    "(CONFIG.ghl && g.updated ? " + A + " and GHL updated" + A + " : (CONFIG.ghl && g.reason ? " + A + ". GHL not updated: " + A + " + String(g.reason).slice(0, 70) : " + A + A + "))",
)

SUBS = [S0, S1, S2, S3, S4, S5, S6, S7, S8, S9]

html = io.open(SRC, "r", encoding="utf-8", newline="").read()
for old, new in SUBS:
    n = html.count(old)
    print("%-2d %s" % (n, old[:78].replace("\n", " ")))
    if n != 1:
        raise SystemExit("ABORT: need exactly 1 occurrence")

with io.open(OUT, "w", encoding="utf-8", newline="") as fh:
    json.dump([[o, n] for o, n in SUBS], fh, ensure_ascii=False, indent=1)
print("wrote", OUT, "with", len(SUBS), "substitutions")
