"""Run the two gates that matter for this change, without cmd quoting.

  python scripts\\ship\\_check.py [tsc|eslint|both]
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NODE = "node"


def run(label, args):
    print(f"=== {label} ===", flush=True)
    proc = subprocess.run(
        args,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    print(f"exit={proc.returncode}")
    if out.strip():
        print(out.rstrip())
    print(f"=== {label} END ===", flush=True)
    return proc.returncode


what = (sys.argv[1] if len(sys.argv) > 1 else "both").lower()
codes = []

if what in ("tsc", "both"):
    codes.append(run("tsc", [NODE, "node_modules/typescript/bin/tsc", "-b", "--pretty", "false"]))

if what in ("eslint", "both"):
    codes.append(
        run(
            "eslint",
            [
                NODE,
                "node_modules/eslint/bin/eslint.js",
                "src/packs/door_to_door",
                "src/components/Dashboard.tsx",
                "src/lib/packs.ts",
            ],
        )
    )

print("FAIL" if any(codes) else "PASS")
