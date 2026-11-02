"""Deploy one edge function from supabase/functions/<slug>/ with the Supabase CLI (API bundling, no Docker).
  python deploy_fn.py <slug> [--no-verify-jwt]
SUPABASE_ACCESS_TOKEN is read from ~/.mcp.json at runtime and passed only via the environment.
"""
import os
import pathlib
import subprocess
import sys

import shiplib as L

slug = sys.argv[1]
flags = [a for a in sys.argv[2:] if a.startswith("--")]
repo = pathlib.Path(__file__).resolve().parents[2]
env = dict(os.environ, SUPABASE_ACCESS_TOKEN=L.sb_token())
base = ["npx", "-y", "supabase@2.122.0", "functions", "deploy", slug, "--project-ref", L.REF]


def run(cmd):
    p = subprocess.run(cmd, cwd=str(repo), env=env, capture_output=True, text=True, shell=(os.name == "nt"),
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return p.returncode, (p.stdout + p.stderr)


rc, out = run(base + ["--use-api"] + flags)
if rc != 0 and "unknown flag" in out and "use-api" in out:
    rc, out = run(base + flags)
tail = "\n".join(out.strip().splitlines()[-8:])
print(f"[{slug}] exit {rc}\n{tail}")
sys.exit(rc)
