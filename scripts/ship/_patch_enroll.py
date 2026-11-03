"""Wire the Door to Door -> Dial Smart follow-up bridge into the ported host.

Three byte-exact insertions into src/packs/door_to_door/host.ts:
  1. the import
  2. syncDoorFollowUps(), next to pushKnocks which calls it
  3. the call itself, after the knocks are stored

Fails loudly if an anchor does not match exactly once, and preserves LF endings.
"""

import pathlib
import sys

HOST = pathlib.Path("src/packs/door_to_door/host.ts")

IMPORT_ANCHOR = "import { resolveOrganizationId } from '@/lib/d2dApi';\n"
IMPORT_ADD = "import { enrollDoorFollowUp } from './enroll';\n"

FUNC_ANCHOR = """  /**
   * The knock queue replays rows the phone recorded offline, and it depends on getting a
"""

FUNC_ADD = """  /**
   * A follow-up booked at a door is also a Dial Smart follow-up. The knock upload calls this once
   * the knocks are stored: the homeowner becomes a lead and the callback is queued where the dialer
   * already looks, so nobody re-types a doorstep into the CRM.
   *
   * It never throws and never blocks a knock - see enroll.ts for the consent gate, and for why a
   * failure here is not the rep's problem.
   */
  async function syncDoorFollowUps(rows: Row[]): Promise<void> {
    const booked = rows.filter(
      (row) =>
        (String(row.status) === 'callback' && row.callback_at) ||
        (String(row.status) === 'appointment' && row.appointment_at),
    );
    if (!booked.length) return;

    // One row per house, last wins: a batch can carry two knocks for the same door.
    const latest = new Map<string, Row>();
    for (const row of booked) latest.set(String(row.property_id), row);

    const org = await organizationId('POST', '/knocks');
    const auth = await db.auth.getUser();
    const userId = auth.data.user?.id;
    if (!userId) return;

    const res = await db
      .from('d2d_properties')
      .select('id, address, city, state, zip, owner_name, owner_phone, text_ok, dnc')
      .in('id', [...latest.keys()]);
    if (res.error) return;
    const houses = new Map(((res.data ?? []) as Row[]).map((house) => [String(house.id), house]));

    for (const [propertyId, knock] of latest) {
      const house = houses.get(propertyId);
      if (!house) continue;
      await enrollDoorFollowUp(db, {
        organizationId: org,
        userId,
        propertyId,
        address: asText(house.address),
        city: asText(house.city),
        state: asText(house.state),
        zip: asText(house.zip),
        ownerName: asText(house.owner_name),
        ownerPhone: asText(house.owner_phone),
        // The knock carries what the rep tapped; the house carries what the table kept. Either one
        // is consent - a house the rep just spoke to is never skipped over a stale column.
        textOk: knock.text_ok === true || house.text_ok === true,
        dnc: house.dnc === true,
        dueAt: String(knock.callback_at ?? knock.appointment_at),
        note: asText(knock.note),
      }).catch(() => 'failed');
    }
  }

  /** A trimmed string, or null. The d2d tables use '' and null interchangeably for "not set". */
  function asText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }

"""

CALL_ANCHOR = """    const saved = (res.data ?? []) as Row[];
    const seen = new Set(saved.map((row) => String(row.client_id)));
"""

CALL_ADD = CALL_ANCHOR + """
    // A follow-up booked at a door is also a Dial Smart follow-up: the homeowner becomes a lead and
    // the callback is queued where the dialer already looks. Best effort on purpose, and awaited so
    // it cannot be cut off mid-flight - see syncDoorFollowUps, and enroll.ts for what it writes.
    await syncDoorFollowUps(incoming).catch(() => undefined);
"""


def splice(source: str, anchor: str, addition: str, label: str) -> str:
    count = source.count(anchor)
    if count != 1:
        sys.exit("FAIL %s: anchor matched %d times, expected 1" % (label, count))
    return source.replace(anchor, addition, 1)


def main() -> None:
    raw = HOST.read_bytes().decode("utf-8")
    crlf = raw.count("\r\n")
    source = raw.replace("\r\n", "\n")
    print("read %d bytes (%d CRLF) -> normalised" % (len(raw), crlf))

    source = splice(source, IMPORT_ANCHOR, IMPORT_ANCHOR + IMPORT_ADD, "import")
    print("  ok import")
    source = splice(source, FUNC_ANCHOR, FUNC_ADD + FUNC_ANCHOR, "syncDoorFollowUps")
    print("  ok syncDoorFollowUps")
    source = splice(source, CALL_ANCHOR, CALL_ADD, "call")
    print("  ok call site")

    HOST.write_bytes(source.encode("utf-8"))
    print("wrote %d bytes (LF)" % len(source.encode("utf-8")))


main()
