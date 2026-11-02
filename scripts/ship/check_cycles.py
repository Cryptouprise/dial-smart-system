"""Fail if any Supabase edge-function entry has a runtime import cycle.

Why this exists (bug 4, 2026-11-02): `_shared/twilio.ts` and
`_shared/voice-provider.ts` imported each other, and `voice-provider.ts` read
`twilioProvider` at module scope. Entry files that imported `twilio.ts` first
therefore evaluated `voice-provider.ts` while `twilio.ts` was still
initialising, and the module-scope read hit the temporal dead zone:

    ReferenceError: Cannot access 'twilioProvider' before initialization

Deno/Supabase reports a module-load failure as HTTP 500 WORKER_ERROR on EVERY
request, including OPTIONS. Three functions shipped like that. A cycle is not
always fatal, but it is always a trap, so treat it as an error here.

Only RUNTIME imports count: `import type { ... }` is erased by the bundler and
cannot cause a load-time failure.

Usage:
    python scripts/ship/check_cycles.py            # exits 1 on any cycle
    python scripts/ship/check_cycles.py --all      # also scan _shared/*.test.ts
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2] / "supabase" / "functions"

# `import ... from 'x'` / `export ... from 'x'`, but never `import type ...`
RUNTIME = re.compile(
    r"^\s*(?:import|export)\s+(?!type\s)(?:[^;'\"]*?\bfrom\s+)?['\"]([^'\"]+)['\"]",
    re.M,
)


def runtime_edges(path: pathlib.Path) -> list[pathlib.Path]:
    out = []
    for spec in RUNTIME.findall(path.read_text(encoding="utf-8", errors="ignore")):
        if not spec.startswith("."):
            continue
        target = (path.parent / spec).resolve()
        if target.exists():
            out.append(target)
    return out


def cycles_from(start: pathlib.Path) -> list[list[pathlib.Path]]:
    """DFS; report every cycle that closes back onto the current stack."""
    found: list[list[pathlib.Path]] = []
    stack: list[pathlib.Path] = []
    done: set[pathlib.Path] = set()

    def dfs(node: pathlib.Path) -> None:
        if node in stack:
            found.append(stack[stack.index(node):] + [node])
            return
        if node in done:
            return
        stack.append(node)
        for nxt in runtime_edges(node):
            dfs(nxt)
        stack.pop()
        done.add(node)

    dfs(start.resolve())
    return found


def main() -> int:
    include_tests = "--all" in sys.argv
    if not ROOT.is_dir():
        print(f"check_cycles: not found: {ROOT}")
        return 2

    entries = [
        d / "index.ts"
        for d in sorted(ROOT.iterdir())
        if d.is_dir() and d.name != "_shared" and (d / "index.ts").exists()
    ]

    bad = 0
    for entry in entries:
        for cycle in cycles_from(entry):
            bad += 1
            chain = " -> ".join(p.name for p in cycle)
            print(f"CYCLE  {entry.parent.name}: {chain}")

    if include_tests:
        for f in sorted((ROOT / "_shared").glob("*.test.ts")):
            for cycle in cycles_from(f):
                bad += 1
                print(f"CYCLE  _shared/{f.name}: " + " -> ".join(p.name for p in cycle))

    if bad:
        print(f"\ncheck_cycles: FAIL - {bad} runtime import cycle(s) reachable from an entry.")
        print("Break the cycle, or make the module-scope read lazy. See SHIP-RUNBOOK.md bug 4.")
        return 1

    print(f"check_cycles: OK - {len(entries)} entries, no runtime import cycles.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
