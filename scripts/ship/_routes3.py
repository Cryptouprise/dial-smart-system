"""Every route the vendored app asks the host for.

The add-ons call `call('/x/y', body)` or `window.__D2D_HOST.api('POST', '/x/y', body)`. This lists
each distinct path so the host's switch can be checked against the app rather than against memory.
"""
import re
from pathlib import Path

SRC = Path(r"C:\Users\charl\dial-smart-system\src\packs\door_to_door\app\scripts.js")
text = SRC.read_text(encoding="utf-8", errors="replace")

patterns = [
    re.compile(r"""call\(\s*['"]([^'"]+)['"]"""),
    re.compile(r"""__D2D_HOST\.api\(\s*['"][A-Z]+['"]\s*,\s*['"]([^'"]+)['"]"""),
    re.compile(r"""api\(\s*['"][A-Z]+['"]\s*,\s*['"](/[^'"]*)['"]"""),
]

found: dict[str, int] = {}
for pat in patterns:
    for line_no, line in enumerate(text.splitlines(), 1):
        for match in pat.finditer(line):
            path = match.group(1)
            if not path.startswith("/"):
                continue
            found.setdefault(path, line_no)

print(f"distinct host paths: {len(found)}")
for path in sorted(found):
    print(f"{path:34s} first seen line {found[path]}")
