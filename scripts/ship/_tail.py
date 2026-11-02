"""Print the tail of a text file (gate-safe, no shell quoting games)."""
import io, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = sys.argv[1]
n = int(sys.argv[2]) if len(sys.argv) > 2 else 25
raw = io.open(p, 'rb').read()
lines = raw.split(b'\n')
print('bytes', len(raw), 'crlf', raw.count(b'\r\n'), 'lines', len(lines))
print('---- tail ----')
for ln in lines[-n:]:
    print(ln.rstrip(b'\r').decode('utf-8', 'replace'))
