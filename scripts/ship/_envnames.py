"""List environment variable NAMES that look like router/API credentials.

Names only. Values are never read, printed or logged.
"""
import os

needles = ("ROUTER", "OPENAI", "ANTHROPIC", "API_KEY", "OPENROUTER", "ORCA")
found = []
for name in sorted(os.environ):
    up = name.upper()
    if any(n in up for n in needles):
        found.append((name, len(os.environ[name])))
if not found:
    print("no router/API-key-shaped env vars are set in this shell")
for name, n in found:
    print("%-40s value_length=%d" % (name, n))
