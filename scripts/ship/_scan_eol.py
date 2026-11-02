import io, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

files = [
    r'supabase\migrations\20261029010000_industry_packs.sql',
    r'supabase\migrations\20261029142121_phase1_org_scope.sql',
    r'src\lib\packs.ts',
    r'src\components\PackComingSoon.tsx',
    r'src\hooks\useEnabledPacks.ts',
    r'src\lib\voice\BrowserPhone.ts',
    r'src\components\call\CoachPanel.tsx',
]
for f in files:
    if not os.path.exists(f):
        print('MISSING', f)
        continue
    b = io.open(f, 'rb').read()
    crlf = b.count(b'\r\n')
    lf = b.count(b'\n')
    print('%-70s bytes=%7d crlf=%5d lf=%5d lone_lf=%5d' % (f, len(b), crlf, lf, lf - crlf))
