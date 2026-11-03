import sys
for p in sys.argv[1:]:
    b = open(p, 'rb').read()
    bad = [(i, b[i]) for i in range(len(b)) if b[i] > 126 and b[i] not in (9, 10, 13)]
    lines = b.count(b'\n') + (0 if b.endswith(b'\n') else 1)
    crlf = b.count(b'\r\n')
    print(f"{p}")
    print(f"  bytes={len(b)} lines={lines} crlf={crlf} lf_only={crlf == 0}")
    print(f"  non_ascii={len(bad)}" + ("" if not bad else f" first={bad[:5]}"))
