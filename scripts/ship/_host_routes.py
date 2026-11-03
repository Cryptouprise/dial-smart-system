"""Compare the routes the app calls against the route heads host.ts answers.

Reads the case labels out of host.ts and the distinct paths out of app/scripts.js, then prints the
gap. Run after every host.ts change: a new add-on block that asks for a route nobody answers shows
up here as an UNANSWERED line rather than as a blank card in the browser.
"""
import re
from pathlib import Path

HOST = Path(r"C:\Users\charl\dial-smart-system\src\packs\door_to_door\host.ts")
APP = Path(r"C:\Users\charl\dial-smart-system\src\packs\door_to_door\app\scripts.js")

host_text = HOST.read_text(encoding="utf-8", errors="replace")
app_text = APP.read_text(encoding="utf-8", errors="replace")

heads = set(re.findall(r"""case\s+'([a-z_]+)'\s*:""", host_text))

paths: set[str] = set()
for pat in (
    re.compile(r"""call\(\s*['"]([^'"]+)['"]"""),
    re.compile(r"""__D2D_HOST\.api\(\s*['"][A-Z]+['"]\s*,\s*['"]([^'"]+)['"]"""),
    re.compile(r"""api\(\s*['"][A-Z]+['"]\s*,\s*['"](/[^'"]*)['"]"""),
):
    for match in pat.finditer(app_text):
        path = match.group(1)
        if path.startswith("/"):
            paths.add(path.split("?")[0])

print(f"host answers {len(heads)} route heads: {', '.join(sorted(heads))}")
print()
unanswered = []
for path in sorted(paths):
    head = path.split("/")[1] if len(path.split("/")) > 1 else ""
    if head in heads:
        print(f"  ok         {path}")
    else:
        unanswered.append(path)
        print(f"  UNANSWERED {path}")

print()
print(f"{len(unanswered)} unanswered" if unanswered else "every path the app calls has a home")
