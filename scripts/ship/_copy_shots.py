"""Copy the real-host screenshots into docs/img/ under clean names.

The tab order comes from scripts/ship/_d2d_realhost.mjs (EXPECTED_VIEW at line 145):
  0 Doors (view-map)  1 Follow-ups (view-follow)  2 Team (view-team)
  3 Me (view-me)      4 Ask AI (view-me)
plus _d2d_realhost_rep.png, the rep scorecard opened from the team list.
"""
import os, shutil, struct

SHIP = r"C:\Users\charl\dial-smart-system\scripts\ship"
IMG = r"C:\Users\charl\dial-smart-system\docs\img"

PAIRS = [
    ("_d2d_rh_tab_0.png",    "d2d-doors.png"),
    ("_d2d_rh_tab_1.png",    "d2d-followups.png"),
    ("_d2d_rh_tab_2.png",    "d2d-team.png"),
    ("_d2d_rh_tab_3.png",    "d2d-me.png"),
    ("_d2d_rh_tab_4.png",    "d2d-ask.png"),
    ("_d2d_realhost_rep.png", "d2d-rep.png"),
]


def png_size(p):
    with open(p, "rb") as f:
        head = f.read(26)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", head[16:24])


os.makedirs(IMG, exist_ok=True)
total = 0
for src, dst in PAIRS:
    s = os.path.join(SHIP, src)
    if not os.path.exists(s):
        print(f"  MISSING {src}")
        continue
    d = os.path.join(IMG, dst)
    shutil.copyfile(s, d)
    n = os.path.getsize(d)
    total += n
    w, h = png_size(d)
    print(f"  {n:>10,}  {w}x{h}  {dst}")
print(f"  total {total:,} bytes -> {IMG}")
