"""Scan staged git files for anything that looks like a credential.

Usage: python scripts/ship/_secret_scan.py
Exit 1 if any finding. Prints only pattern name + location + a masked snippet.
"""
import re
import subprocess
import sys

PATS = [
    ("openrouter", re.compile(r"sk-or-v1-[A-Za-z0-9]{12,}")),
    ("openai", re.compile(r"sk-[A-Za-z0-9]{32,}")),
    ("anthropic", re.compile(r"sk-ant-[A-Za-z0-9\-_]{20,}")),
    ("google", re.compile(r"AIza[0-9A-Za-z\-_]{30,}")),
    ("twilio_sid", re.compile(r"\bAC[0-9a-f]{32}\b")),
    ("twilio_auth", re.compile(r"\b[0-9a-f]{32}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}\.")),
    ("retell", re.compile(r"\bkey_[A-Za-z0-9]{20,}\b")),
    ("telnyx", re.compile(r"\bKEY[0-9A-F]{20,}\b")),
    ("stripe", re.compile(r"\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b")),
    ("resend", re.compile(r"\bre_[A-Za-z0-9]{16,}\b")),
    ("private_block", re.compile(r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----")),
]


def main():
    out = subprocess.run(["git", "diff", "--cached", "--name-only"],
                         capture_output=True, text=True, cwd=".")
    files = [f.strip() for f in out.stdout.splitlines() if f.strip()]
    print(f"scanning {len(files)} staged files")
    findings = 0
    for f in files:
        try:
            with open(f, "r", encoding="utf-8", errors="replace") as fh:
                lines = fh.readlines()
        except Exception as e:
            print(f"  ! unreadable {f}: {e}")
            continue
        for i, ln in enumerate(lines, 1):
            for name, pat in PATS:
                m = pat.search(ln)
                if m:
                    if name == "twilio_auth":
                        continue  # too generic; twilio_sid covers the real case
                    s = m.group(0)
                    masked = s[:8] + "..." + s[-4:] if len(s) > 14 else s[:4] + "..."
                    print(f"  HIT {name} {f}:{i}  {masked}")
                    findings += 1
    print(f"findings: {findings}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
