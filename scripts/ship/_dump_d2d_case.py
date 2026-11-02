import io, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

p = r'src\components\Dashboard.tsx'
raw = io.open(p, 'rb').read()
lines = raw.split(b'\r\n')
print('crlf lines', len(lines))
for i, b in enumerate(lines):
    if b'd2d-knock-list' in b:
        for j in range(i, min(i + 2, len(lines))):
            print(j + 1, repr(lines[j]))
