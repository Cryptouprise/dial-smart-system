"""Normalize the files I just wrote to CRLF, matching the rest of the repo."""
import io, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

paths = [
    r'supabase\migrations\20261102234500_door_to_door_core.sql',
    r'src\lib\doorToDoor.ts',
    r'src\lib\d2dApi.ts',
    r'src\components\packs\KnockDetailSheet.tsx',
    r'src\components\packs\DoorToDoorKnockList.tsx',
    r'src\hooks\useEnabledPacks.ts',
]

for p in paths:
    raw = io.open(p, 'rb').read()
    crlf = raw.count(b'\r\n')
    lf = raw.count(b'\n')
    lone = lf - crlf
    if lone == 0:
        print('%-70s already CRLF (%d lines)' % (p, crlf))
        continue
    fixed = raw.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
    io.open(p, 'wb').write(fixed)
    after = io.open(p, 'rb').read()
    print('%-70s lone_lf %d -> 0, bytes %d -> %d' % (p, lone, len(raw), len(after)))
