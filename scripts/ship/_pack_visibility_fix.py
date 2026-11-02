"""Make enabling a pack visibly change the sidebar (jcode, 11/02).

Three edits, byte-safe (CRLF preserved, every anchor asserted unique):
  1. DashboardSidebar: an enabled pack's nav group opens by default.
  2. PackSettings: the card copy says the pack adds a sidebar group.
  3. PackSettings: the toast names the pack and says what changed.
"""
import io, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SIDEBAR = r"src\components\DashboardSidebar.tsx"
PACKSET = r"src\components\PackSettings.tsx"

SIDEBAR_OLD = """        label: group.title,
        defaultOpen: false,"""
SIDEBAR_NEW = """        label: group.title,
        // Open by default: enabling a pack must visibly change the sidebar,
        // otherwise the toggle looks like it did nothing.
        defaultOpen: true,"""

COPY_OLD = "            Turn on the industry modules this organization uses. Core screens are always available."
COPY_NEW = ("            Turn on the industry modules this organization uses. Core screens are always available.\n"
            "            An enabled pack adds its own group to the sidebar.")

TOAST_OLD = """      toast({
        title: next ? 'Pack enabled' : 'Pack disabled',
        description: `${pack} ${next ? 'is now on' : 'is now off'} for this organization.`,
      });"""
TOAST_NEW = """      const label = ALL_PACKS.find((entry) => entry.id === pack)?.label ?? pack;
      toast({
        title: next ? `${label} pack enabled` : `${label} pack disabled`,
        description: next
          ? `${label} is on. Its group is now in the sidebar.`
          : `${label} is off. Its group has been removed from the sidebar.`,
      });"""


def patch(path, pairs):
    raw = io.open(path, "rb").read()
    crlf, lf = raw.count(b"\r\n"), raw.count(b"\n")
    if crlf and lf - crlf:
        raise SystemExit("REFUSE: mixed endings in " + path)
    text = raw.decode("utf-8")
    norm = text.replace("\r\n", "\n")
    for old, new in pairs:
        n = norm.count(old)
        if n == 0 and new in norm:
            print("  (already applied)")
            continue
        if n != 1:
            raise SystemExit("REFUSE: %s: anchor matched %d times: %r" % (path, n, old[:60]))
        norm = norm.replace(old, new)
    out = norm.replace("\n", "\r\n") if crlf else norm
    io.open(path, "wb").write(out.encode("utf-8"))
    print("patched %s: %d -> %d bytes (crlf=%d)" % (path, len(raw), len(out.encode("utf-8")), out.count("\r\n")))


patch(SIDEBAR, [(SIDEBAR_OLD, SIDEBAR_NEW)])
patch(PACKSET, [(COPY_OLD, COPY_NEW), (TOAST_OLD, TOAST_NEW)])
print("OK")
