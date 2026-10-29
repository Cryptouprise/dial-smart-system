"""Every client call lands in the intake (Charles 10/21: "when you get all the stuff from the intake portal and the video then we should be able
to see it all in the intake portal ... if it's just a phone call that should be in GHL and that transcription recording should immediately populate").
form_data.calls[] on the intake = one entry per call: kind "phone" (GHL call recording, transcribed on Hermes by doorboss_call_sync.py) or "video"
(the DoorBoss call window's own transcript, posted when the call ends). Each entry: when, direction, duration, who, the transcript, and the facts
the AI pulled out of it (every fact quotes the transcript: the /extract rules). Facts also fill EMPTY intake fields; form_data.callFacts remembers
which, so the portal's autosave keeps them and a rep's later edit wins. The raw transcript is kept beside the recordings. Nothing in GHL changes."""
import os, re, json, time
import rep_assistant as RA
import post_call as PC

E = os.environ.get
MAX_CALLS = 60; MAX_TRANSCRIPT = 24000
ROOMRX = re.compile(r"^db-[0-9a-f]{10}$"); IIDRX = re.compile(r"^[A-Za-z0-9_-]{4,80}$"); MIDRX = re.compile(r"^[A-Za-z0-9_-]{6,80}$")

def _tdir():
    d = os.path.join(E("DOORBOSS_REC_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "recordings"), "transcripts")
    os.makedirs(d, exist_ok=True); return d

def lines_of(body):
    out = []
    for x in (body.get("lines") or [])[-600:]:
        if isinstance(x, dict) and isinstance(x.get("text"), str) and x["text"].strip():
            w = str(x.get("who", "")).strip()
            who = "REP" if w.upper().startswith("R") else "BOTH" if w.upper() == "BOTH" else w if re.fullmatch(r"Speaker [1-9]", w) else "HOMEOWNER"   # BOTH = in-person mic (one channel); Speaker N = diarized recording
            out.append({"who": who, "text": re.sub(r"\s+", " ", x["text"]).strip()[:600]})
    return out

def text_of(lines): return "\n".join("%s: %s" % (l["who"], l["text"]) for l in lines)[:MAX_TRANSCRIPT]

def save_transcript(name, lines, meta):
    """the raw transcript beside the recordings, named by room (video) or GHL message id (phone)"""
    if not re.fullmatch(r"[A-Za-z0-9_-]{4,90}", name): return None
    p = os.path.join(_tdir(), name + ".json"); tmp = p + ".tmp"
    json.dump({"meta": meta, "lines": lines, "saved_at": int(time.time())}, open(tmp, "w", encoding="utf-8")); os.replace(tmp, p)
    return p

def _form(iid):
    rows = RA._q("select id, form_data::text as fd from intakes where id = %s" % RA._lit(iid))
    if not rows: raise RA.AskError(404, "no such intake")
    cur = {}
    try:
        cur = json.loads(rows[0]["fd"]) if rows[0].get("fd") else {}
        if isinstance(cur, str): cur = json.loads(cur)
    except Exception: cur = {}
    return cur if isinstance(cur, dict) else {}

def facts_to_form(facts):
    """AI facts {k: {v, c, e}} -> intake field -> value, with the same map post_call uses for the call workspace"""
    out = {}; plain = {}
    for k, f in (facts or {}).items():
        v = f.get("v") if isinstance(f, dict) else f
        if v is None or v == "": continue
        plain[k] = v
        fk = PC.FORM.get(k)
        if fk: out[fk] = PC._clean(v, 120) if isinstance(v, str) else v
    if plain.get("loan_balance"): out["calcLoanBalance"] = PC._clean(plain["loan_balance"], 20)
    if plain.get("interest_rate"): out["calcInterestRate"] = PC._clean(plain["interest_rate"], 20)
    if plain.get("loan_term_years"): out["calcYearsRemaining"] = PC._clean(plain["loan_term_years"], 20)
    return out

def append_call(iid, entry, facts=None):
    """add one call to the intake's form_data.calls (the same id replaces its older copy) and fill empty fields from its facts"""
    if not IIDRX.match(str(iid)): raise RA.AskError(400, "bad intake id")
    cur = _form(iid)
    calls = [c for c in (cur.get("calls") or []) if isinstance(c, dict) and c.get("id") != entry["id"]] if isinstance(cur.get("calls"), list) else []
    calls.append(entry); calls.sort(key=lambda c: str(c.get("at") or "")); cur["calls"] = calls[-MAX_CALLS:]
    cf = dict(cur.get("callFacts")) if isinstance(cur.get("callFacts"), dict) else {}
    filled = {}
    for fk, v in facts_to_form(facts).items():
        if cur.get(fk) in (None, "", [], {}) or fk in cf:   # empty, or a value an earlier call wrote (a rep's own edit removes the key: portal PUT)
            cur[fk] = v; cf[fk] = {"call": entry["id"], "at": entry.get("at")}; filled[fk] = v
    if cf: cur["callFacts"] = cf
    PC._sql("update intakes set form_data = to_jsonb(%s::text), updated_at = now() where id = %s" % (RA._lit(json.dumps(cur)), RA._lit(iid)))
    return {"calls": len(cur["calls"]), "filled": sorted(filled)}

def ingest(body, rep, extract):
    """one call -> transcript file + the intake's call log (+ AI facts). body: kind phone|video, intake_id, lines[{who,text}], duration (s), at (ISO),
    direction; video adds room_name / property_id, phone adds ghl_message_id / contact_id. Returns counts only."""
    kind = "phone" if body.get("kind") == "phone" else "inperson" if body.get("inperson") is True else "video"
    lines = lines_of(body); iid = str(body.get("intake_id") or "")
    if kind != "phone":
        room = str(body.get("room_name") or "")
        if not ROOMRX.match(room): raise RA.AskError(400, "bad room")
        name, cid = room, "video:" + room
    else:
        mid = str(body.get("ghl_message_id") or "")
        if not MIDRX.match(mid): raise RA.AskError(400, "bad message id")
        name, cid = "ghl-" + mid, mid
    if not lines: return {"ok": True, "saved": False, "reason": "no transcript"}
    at = PC._clean(body.get("at") or body.get("started_at"), 40) or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try: dur = max(0, int(float(body.get("duration") or 0)))
    except Exception: dur = 0
    meta = {"kind": kind, "intake_id": iid if IIDRX.match(iid) else "", "property_id": PC._clean(body.get("property_id"), 40), "at": at, "duration": dur,
            "direction": PC._clean(body.get("direction"), 10), "rep": PC._clean(body.get("rep_name") or (rep or {}).get("name"), 60), "contact_id": PC._clean(body.get("contact_id"), 40), "lines": len(lines)}
    save_transcript(name, lines, meta)
    facts = {}
    if extract and len(lines) >= 2:
        try:
            code, out = extract({"transcript": lines, "_rep": rep or {}})
            if code == 200: facts = out.get("fields") or {}
        except Exception: facts = {}   # the AI being out never loses the call itself
    if not meta["intake_id"]: return {"ok": True, "saved": True, "intake": False, "facts": len(facts)}
    entry = dict(meta, id=cid, transcript=text_of(lines), facts={k: (f.get("v") if isinstance(f, dict) else f) for k, f in facts.items()},
                 quotes={k: PC._clean(f.get("e"), 160) for k, f in facts.items() if isinstance(f, dict) and f.get("e")})
    if kind != "phone": entry["room"] = name
    else: entry["ghl_message_id"] = cid
    r = append_call(meta["intake_id"], entry, facts)
    return {"ok": True, "saved": True, "intake": True, "calls": r["calls"], "filled": r["filled"], "facts": len(facts)}

# ---- 1.20: the kept recording of an IN-PERSON session is one microphone with two people on it. The live transcript cannot tell them apart
# (every line is BOTH), so once Daily's recording lands on this server it goes through ElevenLabs Scribe with speaker separation and the
# intake's entry gets that transcript (Speaker 1 / Speaker 2: honest labels, no guessing who is the rep). Facts from the live pass stay.
def diarize_file(path, mime="video/mp4"):
    import uuid, urllib.request, urllib.error
    key = E("ELEVENLABS_API_KEY", "")
    if not key or not os.path.exists(path) or os.path.getsize(path) < 8000: return None
    b = uuid.uuid4().hex.encode(); data = open(path, "rb").read()
    body = b"".join([b"--" + b + b"\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\nscribe_v1\r\n",
                     b"--" + b + b"\r\nContent-Disposition: form-data; name=\"diarize\"\r\n\r\ntrue\r\n",
                     b"--" + b + b"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"call.mp4\"\r\nContent-Type: " + mime.encode() + b"\r\n\r\n", data, b"\r\n--" + b + b"--\r\n"])
    req = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=body, headers={"xi-api-key": key, "Content-Type": "multipart/form-data; boundary=" + b.decode(), "User-Agent": "doorboss-ai"}, method="POST")
    with urllib.request.urlopen(req, timeout=600) as r: o = json.loads(r.read().decode() or "{}")
    lines, cur, buf, names = [], None, [], {}
    for w in o.get("words") or []:
        if w.get("type") not in (None, "word", "spacing"): continue
        spk = str(w.get("speaker_id") or "s0")
        if cur is None: cur = spk
        if spk != cur:
            t = "".join(buf).strip()
            if t: lines.append((cur, t))
            buf, cur = [], spk
        buf.append(str(w.get("text") or ""))
    t = "".join(buf).strip()
    if t and cur is not None: lines.append((cur, t))
    if not lines and o.get("text"): lines = [("s0", str(o["text"]))]
    for spk, _ in lines: names.setdefault(spk, "Speaker %d" % (len(names) + 1))
    return [{"who": names[spk], "text": txt[:600]} for spk, txt in lines]

def after_recording(entry, path, log=lambda m: None):
    """recordings.sweep hook: in-person recordings get the diarized transcript; the intake entry (id video:<room>) is updated in place"""
    if (entry.get("kind") or "video") != "inperson": return
    iid, room = str(entry.get("intake_id") or ""), str(entry.get("room") or "")
    if not (IIDRX.match(iid) and ROOMRX.match(room)): return
    lines = diarize_file(path)
    if not lines: log("inperson diarize: nothing for %s" % room); return
    save_transcript(room + "-diarized", lines, {"kind": "inperson", "intake_id": iid, "recording": entry.get("id")})
    cur = _form(iid); calls = cur.get("calls") if isinstance(cur.get("calls"), list) else []
    hit = next((c for c in calls if isinstance(c, dict) and c.get("id") == "video:" + room), None)
    if hit is None:
        hit = {"id": "video:" + room, "kind": "inperson", "room": room, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(entry.get("start_ts") or time.time())), "duration": entry.get("duration") or 0, "rep": entry.get("rep_name") or "", "facts": {}, "quotes": {}}
        calls.append(hit)
    hit["transcript"] = text_of(lines); hit["lines"] = len(lines); hit["diarized"] = True; hit["recording_id"] = entry.get("id")
    if not hit.get("duration") and entry.get("duration"): hit["duration"] = entry.get("duration")
    cur["calls"] = calls[-MAX_CALLS:]
    PC._sql("update intakes set form_data = to_jsonb(%s::text), updated_at = now() where id = %s" % (RA._lit(json.dumps(cur)), RA._lit(iid)))
    log("inperson diarized: %s, %d lines" % (room, len(lines)))
