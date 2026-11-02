import io, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

for p in [r'src\components\Dashboard.tsx']:
    raw = io.open(p, 'rb').read()
    crlf = raw.count(b'\r\n')
    lf = raw.count(b'\n')
    print(p, 'bytes', len(raw), 'crlf', crlf, 'lf', lf, 'lone_lf', lf - crlf)
    # locate lone LF (LF not preceded by CR)
    i = 0
    found = 0
    while True:
        j = raw.find(b'\n', i)
        if j < 0:
            break
        if j == 0 or raw[j - 1:j] != b'\r':
            line_no = raw[:j].count(b'\n') + 1
            print('  lone LF at byte', j, 'line', line_no, repr(raw[max(0, j - 60):j + 2]))
            found += 1
            if found > 12:
                print('  ...')
                break
        i = j + 1
