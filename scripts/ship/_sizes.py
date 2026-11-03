import os, struct, sys

PACK = r"C:\Users\charl\dial-smart-system\src\packs\door_to_door"
SHIP = r"C:\Users\charl\dial-smart-system\scripts\ship"

def png_size(p):
    try:
        with open(p, 'rb') as f:
            head = f.read(26)
        if head[:8] != b'\x89PNG\r\n\x1a\n':
            return None
        w, h = struct.unpack('>II', head[16:24])
        return w, h
    except Exception:
        return None

print('== pack files ==')
tot = 0
for dirpath, dirnames, filenames in os.walk(PACK):
    dirnames[:] = [d for d in dirnames if d != 'node_modules']
    for fn in sorted(filenames):
        p = os.path.join(dirpath, fn)
        rel = os.path.relpath(p, PACK)
        b = os.path.getsize(p)
        n = open(p, 'rb').read().count(b'\n') + 1
        tot += b
        print(f'  {b:>9,}  {n:>6,}L  {rel}')
print(f'  TOTAL {tot:,} bytes')

print()
print('== candidate screenshots ==')
for fn in sorted(os.listdir(SHIP)):
    if fn.lower().endswith('.png'):
        p = os.path.join(SHIP, fn)
        sz = png_size(p)
        dim = f'{sz[0]}x{sz[1]}' if sz else '?'
        print(f'  {os.path.getsize(p):>9,}  {dim:>11}  {fn}')

print()
print('== docs ==')
for fn in sorted(os.listdir(r"C:\Users\charl\dial-smart-system\docs")):
    p = os.path.join(r"C:\Users\charl\dial-smart-system\docs", fn)
    if os.path.isfile(p):
        print(f'  {os.path.getsize(p):>9,}  {fn}')
