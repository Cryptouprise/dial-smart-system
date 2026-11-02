import io, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = r"C:\Users\charl\Infinite-AI\jarvis-ops\session-ledger\CHECKPOINT_latest.md"
raw = io.open(P, "rb").read()
assert raw.count(b"\n") == raw.count(b"\r\n") + 0 or raw.count(b"\r\n") == 0, "mixed endings"
s = raw.decode("utf-8")
PAIRS = [
    ("\n## Still open on P1731\n",
     "\n## Still open on P1731 (SUPERSEDED 23:10 - bug 5 applied, voice functions redeployed; see the checkpoint above)\n"),
    ("- **Apply BUG 5's migration (T4) - WAITING ON APPROVAL:**",
     "- **[DONE 23:10 - see the checkpoint above] Apply BUG 5's migration (T4):**"),
    ("- `voice-call`, `voice-call-action`, `voice-call-events`, `voice-token` still run the pre-bug-4 bundle. They work",
     "- **[DONE 23:10 - see the checkpoint above]** `voice-call`, `voice-call-action`, `voice-call-events`, `voice-token` ran the pre-bug-4 bundle. They worked"),
]
for i, (old, new) in enumerate(PAIRS, 1):
    c = s.count(old)
    assert c == 1, "pair %d matched %d, expected 1" % (i, c)
    s = s.replace(old, new)
out = s.encode("utf-8")
io.open(P, "wb").write(out)
print("checkpoint %d -> %d bytes; crlf=%d lone_lf=%d" % (len(raw), len(out), out.count(b"\r\n"), out.count(b"\n") - out.count(b"\r\n")))
