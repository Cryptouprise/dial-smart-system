"""Deploy the 4 voice functions in the runbook order, stopping on the first failure.

  python _deploy_voice.py
Each call is `python deploy_fn.py <slug> [--no-verify-jwt]` (silent wrapper, no console window).
"""
import os
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
JOBS = [("voice-call-events", ["--no-verify-jwt"]), ("voice-token", []),
        ("voice-call", []), ("voice-call-action", [])]

for i, (slug, flags) in enumerate(JOBS, 1):
    print("JCODE_PROGRESS {\"current\": %d, \"total\": 4, \"unit\": \"functions\", \"message\": \"deploying %s\"}" % (i, slug))
    p = subprocess.run([sys.executable, os.path.join(HERE, "deploy_fn.py"), slug] + flags,
                       capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(HERE)),
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    out = (p.stdout or "") + (p.stderr or "")
    print(out.strip()[-900:])
    print("   -> exit %d" % p.returncode)
    if p.returncode != 0:
        print("STOP: %s failed; not deploying the rest" % slug)
        sys.exit(p.returncode)
print("ALL 4 DEPLOYED")
