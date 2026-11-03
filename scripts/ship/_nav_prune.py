"""nav: remove the leftover pre-port Door-to-Door screens and the modules private to them.

Proven dead by scripts\\ship\\_imp.py (repo-wide, static + dynamic imports):
  DoorToDoorKnockList 0 importers, DoorToDoorMap 0, KnockDetailSheet 0 (only the two dead screens),
  DoorMap 0 (only DoorToDoorMap), d2dMapEngine 0 (only DoorMap), d2dMapLayers 0 (only d2dMapEngine).
  d2dMap is then referenced only by its own test, so both go.
Kept: d2dApi (src/packs/door_to_door/host.ts uses resolveOrganizationId), CallWorkspace (post-port work).
"""
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

TARGETS = [
    "src/components/packs/DoorToDoorKnockList.tsx",
    "src/components/packs/DoorToDoorMap.tsx",
    "src/components/packs/KnockDetailSheet.tsx",
    "src/components/packs/DoorMap.tsx",
    "src/lib/d2dMapEngine.ts",
    "src/lib/d2dMapLayers.ts",
    "src/lib/d2dMap.ts",
    "src/lib/__tests__/d2dMap.test.ts",
]

dry = "--apply" not in sys.argv
removed = 0
for rel in TARGETS:
    path = os.path.join(ROOT, rel.replace("/", os.sep))
    if not os.path.exists(path):
        print(f"MISSING  {rel}")
        continue
    size = os.path.getsize(path)
    if dry:
        print(f"would remove  {rel}  ({size} bytes)")
        continue
    os.remove(path)
    print(f"removed       {rel}  ({size} bytes)")
    removed += 1

if dry:
    print("\ndry run - pass --apply to delete")
else:
    print(f"\n{removed} file(s) removed")
    # prune the now-empty dir if it is empty
    d = os.path.join(ROOT, "src", "components", "packs")
    if os.path.isdir(d) and not os.listdir(d):
        os.rmdir(d)
        print("removed empty dir  src/components/packs")
