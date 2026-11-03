"""Three fixes found by the route test.

1. opsFrom read `row.ops`, but the scratch key is written to `row.settings.ops`, so nothing the
   host stored (competitions, feed, export log) ever read back.
2. "half a mile" contains "a mile", so the Ask panel answered a half-mile question with a one-mile
   radius. Half must be tested before one.
3. The area card told a ZIP with un-phoned homes that "every home already has a phone on file".
"""
from pathlib import Path

HOST = Path(r"C:\Users\charl\dial-smart-system\src\packs\door_to_door\host.ts")

raw = HOST.read_bytes()
text = raw.decode("utf-8")
CRLF = "\r\n" in text
flat = text.replace("\r\n", "\n")

swaps: list[tuple[str, str]] = []


def swap(old: str, new: str) -> None:
    swaps.append((old, new))


swap(
    """/** Competitions, the team feed and the export log, read out of the one JSON key they share. */
function opsFrom(settings: Row): OpsState {
  const ops = (settings.ops ?? {}) as Row;
  const list = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
  return { competitions: list(ops.competitions), feed: list(ops.feed), exports: list(ops.exports) };
}
""",
    """/**
 * Competitions, the team feed and the export log, read out of the one JSON key they share. The
 * argument is the d2d_settings ROW, so the scratch key sits at row.settings.ops - one level in
 * from the row itself, which is also where patchOps puts it.
 */
function opsFrom(row: Row): OpsState {
  const settings = (row.settings ?? {}) as Row;
  const ops = (settings.ops ?? {}) as Row;
  const list = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
  return { competitions: list(ops.competitions), feed: list(ops.feed), exports: list(ops.exports) };
}
""",
)

swap(
    """      const miles = /quarter/i.test(question) ? 0.25 : /\\b(?:one|a) mile\\b/i.test(question) ? 1 : 0.5;
""",
    """      // "half a mile" contains "a mile", so half has to be tested before one.
      const miles = /quarter/i.test(question)
        ? 0.25
        : /\\bhalf (?:a )?mile\\b/i.test(question)
          ? 0.5
          : /\\b(?:one|1|a) mile\\b/i.test(question)
            ? 1
            : 0.5;
""",
)

swap(
    """    return {
      zip,
      homes: homes.length,
      no_phone: noPhone.length,
      orphaned_no_phone: orphaned.length,
      will_trace: 0,
      est_cost: 0,
      cap_left: 0,
      note: wanted
        ? `${wanted} home${wanted === 1 ? '' : 's'} could be traced, but skip tracing is not wired into this app yet.`
        : 'Every home in this ZIP already has a phone on file.',
    };
""",
    """    // Three honest answers: there is something to trace, there are un-phoned homes but none of
    // them are the orphaned ones being filtered for, or the ZIP really is fully covered.
    let note: string;
    if (wanted > 0) {
      note = `${wanted} home${wanted === 1 ? '' : 's'} could be traced, but skip tracing is not wired into this app yet.`;
    } else if (noPhone.length > 0) {
      note = `${noPhone.length} home${noPhone.length === 1 ? '' : 's'} have no phone, but none of them have a bankrupt installer.`;
    } else {
      note = 'Every home in this ZIP already has a phone on file.';
    }

    return {
      zip,
      homes: homes.length,
      no_phone: noPhone.length,
      orphaned_no_phone: orphaned.length,
      will_trace: 0,
      est_cost: 0,
      cap_left: 0,
      note,
    };
""",
)

for old, new in swaps:
    found = flat.count(old)
    if found != 1:
        raise SystemExit(f"anchor matched {found} time(s), expected 1:\n---\n{old[:300]}\n---")
    flat = flat.replace(old, new, 1)

out = flat.replace("\n", "\r\n") if CRLF else flat
HOST.write_bytes(out.encode("utf-8"))
print(f"host.ts fixed: {len(swaps)} edits")
