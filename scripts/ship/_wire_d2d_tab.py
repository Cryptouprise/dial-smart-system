"""Normalize Dashboard.tsx to CRLF, then point the d2d-knock-list tab at the real screen."""
import io, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

p = r'src\components\Dashboard.tsx'
raw = io.open(p, 'rb').read()
before_bytes = len(raw)
before_crlf = raw.count(b'\r\n')
before_lone = raw.count(b'\n') - before_crlf

# 1. lone LF -> CRLF (the editor tool writes LF for inserted lines)
fixed = raw.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
print('lone LF normalized:', before_lone)

# 2. tab wiring
old = (
    b"      case 'd2d-knock-list':\r\n"
    b'        return <TabErrorBoundary tabName="Knock list"><Suspense fallback={<TabLoader />}>'
    b'<PackComingSoon pack="door_to_door" feature="Knock list" /></Suspense></TabErrorBoundary>;'
)
new = (
    b"      case 'd2d-knock-list':\r\n"
    b'        return <TabErrorBoundary tabName="Knock list"><Suspense fallback={<TabLoader />}>'
    b'<DoorToDoorKnockList /></Suspense></TabErrorBoundary>;'
)
count = fixed.count(old)
print('tab case occurrences', count)
assert count == 1, 'expected exactly one occurrence'
fixed = fixed.replace(old, new)

io.open(p, 'wb').write(fixed)
after = io.open(p, 'rb').read()
print('bytes', before_bytes, '->', len(after))
print('crlf', after.count(b'\r\n'), 'lone_lf', after.count(b'\n') - after.count(b'\r\n'))
print('DoorToDoorKnockList refs', after.count(b'DoorToDoorKnockList'))
print('PackComingSoon refs', after.count(b'PackComingSoon'))
