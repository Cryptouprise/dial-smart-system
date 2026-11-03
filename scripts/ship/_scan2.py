import re
import sys
from pathlib import Path

pattern = sys.argv[1]
path = Path(sys.argv[2])
out = Path(sys.argv[3])

rx = re.compile(pattern)
lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
hits = [f"{n}| {line}" for n, line in enumerate(lines, 1) if rx.search(line)]
out.write_text("\n".join(hits) + f"\n-- {len(hits)} hit(s) in {len(lines)} line(s)\n", encoding="utf-8")
print(f"{len(hits)} hit(s) -> {out}")
