"""Call recordings: KEPT on our server (Charles 10/20: "of course we want the damn recordings kept").

Daily records in the cloud (paid-plan feature; room property enable_recording=cloud, started by the call window only after the
homeowner says OK). Daily's docs do not promise how long it keeps files, so when a recording finishes we download it here and
keep it: /opt/doorboss-ai/recordings/<recording id>.mp4, indexed in recordings_index.json with the company, house, intake and rep.
Playback = a short-lived signed link (15 min) handed only to people in the same company (the owner sees all)."""
import os, json, time, hmac, hashlib, threading, re, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.environ.get("DOORBOSS_REC_DIR") or os.path.join(HERE, "recordings")
INDEX = os.path.join(DIR, "recordings_index.json")
LOCK = threading.Lock()
IDRX = re.compile(r"^[0-9a-f-]{20,64}$")

def _load():
    try: return json.load(open(INDEX, encoding="utf-8"))
    except Exception: return {"recordings": {}, "rooms": {}}
def _save(s):
    os.makedirs(DIR, exist_ok=True); tmp = INDEX + ".tmp"
    json.dump(s, open(tmp, "w", encoding="utf-8")); os.replace(tmp, INDEX)

def remember_room(name, meta):
    """called when a room is made: who/where it belongs to, so its recordings can be filed (kept 7 days for the sweep)"""
    with LOCK:
        s = _load(); s["rooms"][name] = dict(meta, at=int(time.time())); _save(s)

def sweep(daily, log=lambda m: None, max_age_h=72, on_saved=None):
    """download every finished recording of our recent rooms that is not kept yet. `daily(method, path)` is the service's Daily client."""
    with LOCK: s = _load()
    now = time.time(); saved = 0
    for room, meta in list(s["rooms"].items()):
        if now - meta.get("at", now) > max_age_h * 3600: continue
        try: lst = daily("GET", "/recordings?room_name=" + room)
        except Exception as e: log("rec list %s: %s" % (room, e)); continue
        for r in (lst.get("data") or []):
            rid = str(r.get("id") or "")
            if not IDRX.match(rid) or rid in s["recordings"] or r.get("status") != "finished": continue
            try:
                link = daily("GET", "/recordings/%s/access-link?valid_for_secs=3600" % rid).get("download_link")
                if not link: continue
                os.makedirs(DIR, exist_ok=True); path = os.path.join(DIR, rid + ".mp4"); tmp = path + ".part"
                with urllib.request.urlopen(link, timeout=600) as src, open(tmp, "wb") as out:
                    while True:
                        b = src.read(1 << 20)
                        if not b: break
                        out.write(b)
                os.replace(tmp, path)
                entry = {"id": rid, "room": room, "start_ts": r.get("start_ts"), "duration": r.get("duration"), "size": os.path.getsize(path),
                         "company_id": meta.get("company_id") or "", "rep_id": meta.get("rep_id") or "", "rep_name": meta.get("rep_name") or "",
                         "property_id": meta.get("property_id") or "", "intake_id": meta.get("intake_id") or "", "kind": meta.get("kind") or "video", "saved_at": int(time.time())}
                with LOCK:
                    s2 = _load(); s2["recordings"][rid] = entry; _save(s2); s = s2
                saved += 1; log("recording kept: %s (%s bytes)" % (rid, entry["size"]))
                if on_saved:
                    try: on_saved(entry, path)
                    except Exception as e: log("rec on_saved %s: %s" % (rid, type(e).__name__))
            except Exception as e:
                log("rec download %s: %s" % (rid, type(e).__name__))
    # forget rooms older than 7 days (their recordings, if any, are already kept)
    with LOCK:
        s3 = _load(); s3["rooms"] = {k: v for k, v in s3["rooms"].items() if now - v.get("at", now) < 7 * 86400}; _save(s3)
    return saved

def visible(rep, company_of, filt):
    """recordings this person may see: same company (the owner: all); reps only their own calls. filt: property_id / intake_id / room"""
    with LOCK: recs = list(_load()["recordings"].values())
    co = company_of(rep)
    out = []
    for r in recs:
        if co is not None and r.get("company_id") != co: continue
        if rep.get("role") not in ("admin", "manager", "owner") and not rep.get("super_admin") and r.get("rep_id") != str(rep.get("id")): continue
        if filt.get("property_id") and r.get("property_id") != filt["property_id"]: continue
        if filt.get("intake_id") and r.get("intake_id") != filt["intake_id"]: continue
        if filt.get("room") and r.get("room") != filt["room"]: continue
        out.append({k: r.get(k) for k in ("id", "room", "start_ts", "duration", "size", "rep_name", "property_id", "intake_id", "kind")})
    return sorted(out, key=lambda x: -(x.get("start_ts") or 0))

def sign(rid, secret, ttl=900):
    exp = int(time.time()) + ttl
    sig = hmac.new(secret.encode(), ("%s|%d" % (rid, exp)).encode(), hashlib.sha256).hexdigest()[:32]
    return exp, sig

def check_sig(rid, exp, sig, secret):
    try: exp = int(exp)
    except Exception: return False
    if exp < time.time(): return False
    want = hmac.new(secret.encode(), ("%s|%d" % (rid, exp)).encode(), hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(want, str(sig))

def file_for(rid):
    if not IDRX.match(str(rid)): return None
    with LOCK: r = _load()["recordings"].get(rid)
    p = os.path.join(DIR, rid + ".mp4")
    return p if r and os.path.exists(p) else None
