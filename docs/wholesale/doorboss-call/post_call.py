"""AFTER-CALL WRITE-BACK (Charles 10/17: "where's all the intake portal getting filled out"). POST /complete from the call screen when the manager logs the outcome.
What it does with the case file (what they said + every AI fact the manager accepted + docs + notes):
  1. portal `intakes` row (the ESR intake portal record): upsert one row per call, form_data in the portal's own key set (solarInstaller, financeCompanyIntake, monthlyPaymentIntake, ...),
     rep/client/address filled from the rep and the house, status 'draft', phase 1, intakeNotes carries the call summary, docs and every accepted fact with its quote.
  2. portal `properties`: finance_co / system_kw filled when blank.
  3. GHL contact (properties.ghl_contact_id, made by the knock sync): contract custom fields written through the Solar Freedom PIT (same key the sync uses).
     A field that already has a value is NEVER overwritten except the monthly payment and the loan balance (they change). No contact yet = skipped with the reason.
Modes: DOORBOSS_POSTCALL_MODE=dry (default) returns the exact plan and writes nothing; live writes. Every run is appended to the audit log; the state file maps a call to its intake row so a second "End call" updates instead of duplicating.
Portal SQL rules apply (SELECT-first, no alias t, `as` on keyword aliases)."""
import os, re, json, time, uuid, threading, urllib.request, urllib.error, datetime as dt
import rep_assistant as RA
E = os.environ.get
STATE = E("DOORBOSS_POSTCALL_STATE", "/opt/doorboss-ai/postcall_state.json"); AUDIT = E("DOORBOSS_POSTCALL_AUDIT", "/opt/doorboss-ai/postcall_audit.jsonl")
GHL_BASE = "https://services.leadconnectorhq.com"; GHL_LOC = E("SF_LOCATION_ID", "WBEbDUNxKL5GyxIUjjdZ")
# GHL custom field ids on the Solar Freedom / ESR location (verified in the esr-send-contracts skill 2026-06-16); loan balance id is verified live before use (see verify_balance_field)
GHL_FIELDS = {"installer": "4ReLHd03ldWYNGM0yTMl", "lender": "tcKWcX0j0RZTyYCmd7pB", "interest_rate": "jEH6dT8zvY0QWELDHY0P", "loan_term_years": "PEwg5CoM3PmERqm9Fms8", "system_size_kw": "IDzpwqyIxUlFyq46UWGO", "monthly_payment": "ZSHtLUxHKw3qfPrHRINP", "loan_amount": "2skUcdtbj0MYXQ27AZo7",
              "loan_balance": "orUbIweQO8GfwdyGz6Jv"}   # "Loan Balance" (live-verified on the location 10/17; "Outstanding Balance" vCaZ7rPiaYlKOkyWizrJ also exists, not used)
OVERWRITE_OK = {"monthly_payment", "loan_balance"}
# case-file key -> intake portal form key
FORM = {"installer": "solarInstaller", "lender": "financeCompanyIntake", "monthly_payment": "monthlyPaymentIntake", "loan_balance": "outstandingBalance", "loan_amount": "origLoanAmount", "interest_rate": "interestRate", "loan_term_years": "loanTerm",
        "system_size_kw": "systemSize", "year_installed": "dateInstalled", "has_battery": "batteryIncluded", "system_working": "systemOperational", "contacted_installer": "contactedInstaller", "contacted_lender": "contactedLender", "other_signer": "coClientName", "main_issue": "mainIssue", "financing": "financingType", "installer_status": None, "promise_in_writing": "savingsPromisedVerbally", "promised_monthly": None}
LABEL = {"installer": "Installer", "installer_status": "Installer status", "financing": "Financing", "lender": "Lender", "loan_amount": "Loan amount", "loan_balance": "Loan balance", "monthly_payment": "Pays now / month", "promised_monthly": "Told / month", "interest_rate": "Interest rate %", "loan_term_years": "Loan term (years)", "system_size_kw": "System size (kW)", "year_installed": "Year installed", "has_battery": "Has battery", "system_working": "System working", "promise_in_writing": "Promise in writing", "contacted_installer": "Contacted installer", "contacted_lender": "Contacted lender", "other_signer": "Other signer", "main_issue": "Main issue"}
DOCS = ["Loan / finance agreement", "Latest loan statement", "Installation agreement", "Sales messages / screenshots", "Signed authorization"]; DSTATE = ["needed", "asked", "received"]
_lock = threading.Lock()

def _clean(v, n=200):
    if v is None: return ""
    if isinstance(v, bool): return "Yes" if v else "No"
    return re.sub(r"[\x00-\x09\x0b-\x1f<>]", "", re.sub(r"<[^>]*>", "", str(v))).strip()[:n]   # tags removed whole (not just the brackets), newlines kept for notes
def _load():
    try: return json.load(open(STATE, encoding="utf-8"))
    except Exception: return {}
def _save(s):
    try: os.makedirs(os.path.dirname(STATE) or ".", exist_ok=True); tmp = STATE + ".tmp"; json.dump(s, open(tmp, "w", encoding="utf-8")); os.replace(tmp, STATE)
    except Exception: pass
def _audit(rec):
    try:
        os.makedirs(os.path.dirname(AUDIT) or ".", exist_ok=True); open(AUDIT, "a", encoding="utf-8").write(json.dumps(rec) + "\n")
        try: os.chmod(AUDIT, 0o600); os.chmod(STATE, 0o600)   # homeowner facts: owner-only on the server (QA 10/17)
        except Exception: pass
    except Exception: pass
def sf_key():
    """the Solar Freedom PIT, the same way the knock sync finds it: env SF_PIT, else the watchdog file on Hermes. Never logged."""
    if E("SF_PIT"): return E("SF_PIT").strip()
    for p in ("/opt/jarvis/sf_leak_watchdog.py",):
        try:
            m = re.search(r"pit-[0-9a-f-]{36}", open(p, encoding="utf-8").read())
            if m: return m.group(0)
        except Exception: pass
    return ""
def _ghl(method, path, key, body=None, timeout=20):
    base = E("GHL_BASE", GHL_BASE).rstrip("/")
    req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Authorization": "Bearer " + key, "Version": "2021-07-28", "Accept": "application/json", "Content-Type": "application/json", "User-Agent": RA.UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or "{}")
        except Exception: return e.code, {}

def _facts(body):
    """merge what the manager typed (they: promised/actual/lender) with the AI facts the manager accepted (ai: {k: {value}}); typed wins"""
    out = {}
    for k, v in (body.get("ai") or {}).items():
        if k in LABEL and isinstance(v, dict) and v.get("value") not in (None, ""): out[k] = v["value"]
    they = body.get("they") or {}
    if _clean(they.get("actual")): out["monthly_payment"] = _clean(they.get("actual"), 40)
    if _clean(they.get("promised")): out["promised_monthly"] = _clean(they.get("promised"), 40)
    if _clean(they.get("lender")): out["lender"] = _clean(they.get("lender"), 80)
    return out

def plan(rep, body):
    pid = str(body.get("property_id") or "")
    iid_in = str(body.get("intake_id") or "")
    if iid_in and re.fullmatch(r"[A-Za-z0-9_-]{4,80}", iid_in):
        # v48 (10/21): the call was started from the INTAKE page: the client is that intake, not a house. Merge the call facts into it.
        rows = RA._q("select id, client_name, client_phone, client_email, property_address, form_data::text as fd from intakes where id = %s" % RA._lit(iid_in))
        if not rows: raise RA.AskError(404, "no such intake")
        it = rows[0]; cur = {}
        try:
            cur = json.loads(it["fd"]) if it.get("fd") else {}
            if isinstance(cur, str): cur = json.loads(cur)
        except Exception: cur = {}
        if not isinstance(cur, dict): cur = {}
        facts = _facts(body); outcome = _clean(body.get("outcome"), 30) or "interested"
        docs = body.get("docs") if isinstance(body.get("docs"), list) else []
        doc_lines = ["%s: %s" % (DOCS[i], DSTATE[int(d)] if str(d).isdigit() and int(d) < 3 else "needed") for i, d in enumerate(docs[:5])]
        notes = "\n".join(x for x in ["DoorBoss call %s by %s, outcome: %s" % (time.strftime("%Y-%m-%d %H:%M"), _clean(body.get("rep_name") or rep.get("name"), 60), outcome), _clean(body.get("summary"), 600), "Documents: " + "; ".join(doc_lines) if doc_lines else ""] if x)
        form = {}
        for k, v in facts.items():
            fk = FORM.get(k)
            if fk: form[fk] = _clean(v, 120)
        if facts.get("loan_balance"): form["calcLoanBalance"] = _clean(facts["loan_balance"], 20)
        if facts.get("interest_rate"): form["calcInterestRate"] = _clean(facts["interest_rate"], 20)
        if facts.get("loan_term_years"): form["calcYearsRemaining"] = _clean(facts["loan_term_years"], 20)
        prev = _clean(cur.get("intakeNotes"), 4000)
        form["intakeNotes"] = (prev + "\n\n" if prev else "") + notes
        key = "intake:%s|%s" % (iid_in, _clean(body.get("started_at"), 40) or "nostart")
        return {"property": {"id": None, "address": it.get("property_address"), "owner": it.get("client_name")}, "intake_form": form, "property_updates": {}, "ghl": {"contact_id": None, "fields": {}}, "key": key, "outcome": outcome, "intake_id": iid_in}
    if not RA.UUID.match(pid): raise RA.AskError(400, "property_id missing")
    rows = RA._q("select id, address, city, state, zip, owner_name, owner_phone, owner_email, installer, installer_status, ghl_contact_id, finance_co, system_kw from properties where id = %s" % RA._lit(pid))
    # multi-company (10/19): phones, email and the GHL link are per company: use the caller's company's own record for this house, never another company's
    if rows and not RA.esr_only(rep):
        co = RA.company_of(rep) or str(rep.get("company_id") or RA.NOBODY)
        stt = RA._q("select owner_phone, owner_email, ghl_contact_id from property_state where property_id = %s and company_id = %s" % (RA._lit(pid), RA._lit(co)))
        mine = stt[0] if stt else {}
        rows[0] = dict(rows[0], owner_phone=mine.get("owner_phone"), owner_email=mine.get("owner_email"), ghl_contact_id=mine.get("ghl_contact_id"))
    if not rows: raise RA.AskError(404, "no such house")
    p = rows[0]; facts = _facts(body); outcome = _clean(body.get("outcome"), 30) or "interested"
    docs = body.get("docs") if isinstance(body.get("docs"), list) else []
    doc_lines = ["%s: %s" % (DOCS[i], DSTATE[int(d)] if str(d).isdigit() and int(d) < 3 else "needed") for i, d in enumerate(docs[:5])]
    quotes = []
    for k, v in (body.get("ai") or {}).items():
        if k in LABEL and isinstance(v, dict) and v.get("value") not in (None, ""):
            q = _clean(v.get("quote") or v.get("e"), 160); quotes.append("%s = %s%s" % (LABEL[k], _clean(v.get("value"), 80), (' (they said: "%s")' % q) if q else ""))
    notes = "\n".join(x for x in ["DoorBoss call %s by %s, outcome: %s" % (time.strftime("%Y-%m-%d %H:%M"), _clean(body.get("rep_name") or rep.get("name"), 60), outcome), _clean(body.get("summary"), 600), ("Told %s/mo" % facts["promised_monthly"]) if facts.get("promised_monthly") else "", ("Docs: " + "; ".join(doc_lines)) if doc_lines else "", ("Accepted from the live transcript:\n" + "\n".join(quotes)) if quotes else "", _clean(body.get("notes"), 2000)] if x)
    form = {"repId": rep.get("id", ""), "repName": _clean(rep.get("name"), 60), "repEmail": _clean(rep.get("email"), 120), "clientName": _clean(p.get("owner_name"), 120), "clientPhone": _clean(p.get("owner_phone"), 40), "clientEmail": _clean(p.get("owner_email"), 120),
            "propertyAddress": ", ".join(x for x in [_clean(p.get("address"), 120), _clean(p.get("city"), 60), _clean(p.get("state"), 20), _clean(p.get("zip"), 12)] if x), "solarInstaller": _clean(p.get("installer"), 80), "disposition": outcome, "intakeNotes": notes}
    for k, v in facts.items():
        fk = FORM.get(k)
        if fk: form[fk] = _clean(v, 120)
    # the portal's "Payback Engine" box reads its own calc* keys (seen live 10/18: it showed its sample defaults next to our real numbers); feed them the same facts
    if facts.get("loan_balance"): form["calcLoanBalance"] = _clean(facts["loan_balance"], 20)
    if facts.get("interest_rate"): form["calcInterestRate"] = _clean(facts["interest_rate"], 20)
    if facts.get("loan_term_years"): form["calcYearsRemaining"] = _clean(facts["loan_term_years"], 20)
    prop_updates = {}
    if facts.get("lender") and not _clean(p.get("finance_co")): prop_updates["finance_co"] = _clean(facts["lender"], 80)
    if facts.get("system_size_kw") and not _clean(p.get("system_kw")): prop_updates["system_kw"] = _clean(facts["system_size_kw"], 20)
    ghl = {"contact_id": p.get("ghl_contact_id") or None, "fields": {k: _clean(v, 120) for k, v in facts.items() if k in GHL_FIELDS or k == "loan_balance"}}
    key = "%s|%s" % (pid, _clean(body.get("started_at"), 40) or "nostart")
    return {"property": {"id": pid, "address": p.get("address"), "owner": p.get("owner_name")}, "intake_form": form, "property_updates": prop_updates, "ghl": ghl, "key": key, "outcome": outcome}

def _write_intake(rep, pl, st):
    existing = (st.get(pl["key"]) or {}).get("intake_id")
    form = pl["intake_form"]
    if existing:
        # QA 10/17: a second End call must not wipe what the office edited in the portal: merge our call-derived keys over the stored form, keep everything else, and leave client/phone/address alone
        try:
            rows = RA._q("select form_data::text as fd from intakes where id = %s" % RA._lit(existing)); cur = json.loads(rows[0]["fd"]) if rows else {}
            if isinstance(cur, str): cur = json.loads(cur)
            if isinstance(cur, dict): form = dict(cur, **{k: v for k, v in form.items() if v not in ("", None)})
        except Exception: pass
        fd = RA._lit(json.dumps(form))
        _sql("update intakes set form_data = to_jsonb(%s::text), updated_at = now() where id = %s" % (fd, RA._lit(existing)))
        return existing, "updated"
    fd = RA._lit(json.dumps(form))   # the portal stores form_data as a JSON *string* inside jsonb (its own convention): to_jsonb(text) does that one wrapping (live-verified 10/17: a second json.dumps made it unreadable)
    iid = "int_" + uuid.uuid4().hex[:10]
    co = RA.company_of(rep) or str(rep.get("company_id") or "")   # multi-company: the intake belongs to the rep's company (an untagged intake would be invisible to everyone)
    _sql("insert into intakes (id, rep_id, client_name, client_email, client_phone, property_address, current_phase, status, form_data, pricing_plan, updated_at, company_id) values (%s, %s, %s, %s, %s, %s, 1, 'draft', to_jsonb(%s::text), '', now(), __CO__)".replace("__CO__", RA._lit(co) if RA.UUIDRX.match(co) else "null") % (RA._lit(iid), RA._lit(rep.get("email") or rep.get("id") or ""), RA._lit(pl["intake_form"]["clientName"]), RA._lit(pl["intake_form"]["clientEmail"]), RA._lit(pl["intake_form"]["clientPhone"]), RA._lit(pl["intake_form"]["propertyAddress"]), fd))
    return iid, "created"

def _sql(sql):
    base, key = E("PORTAL_BASE", "").rstrip("/"), E("ESR_EXT_KEY", "")
    RA._http(base + "/api/external/sql", {"Authorization": "Bearer " + key}, {"sql": sql}, timeout=60)

def _write_ghl(pl, key):
    cid = pl["ghl"]["contact_id"]; fields = pl["ghl"]["fields"]
    if not cid: return {"updated": False, "reason": "no GHL contact for this house yet (the knock sync makes it within a minute); nothing written"}
    if not fields: return {"updated": False, "reason": "no contract facts to write"}
    st, c = _ghl("GET", "/contacts/" + cid, key)
    if st != 200: return {"updated": False, "reason": "GHL contact lookup failed (%s)" % st}
    cur = {}
    for f in ((c.get("contact") or {}).get("customFields") or []):
        if isinstance(f, dict) and f.get("id"): cur[f["id"]] = f.get("value")
    ids = dict(GHL_FIELDS); bal = E("SF_FIELD_LOAN_BALANCE", "")
    if bal: ids["loan_balance"] = bal
    out, skipped = [], []
    for k, v in fields.items():
        fid = ids.get(k)
        if not fid: skipped.append("%s: no GHL field mapped" % k); continue
        if cur.get(fid) not in (None, "") and k not in OVERWRITE_OK: skipped.append("%s: already %s, kept" % (k, _clean(cur.get(fid), 40))); continue
        out.append({"id": fid, "value": v})
    if not out: return {"updated": False, "reason": "nothing new to write", "skipped": skipped}
    st, r = _ghl("PUT", "/contacts/" + cid, key, {"customFields": out})
    return {"updated": st == 200, "status": st, "written": [k for k in fields if any(o["id"] == ids.get(k) for o in out)], "skipped": skipped, "error": None if st == 200 else _clean(json.dumps(r), 200)}

def complete(rep, body):
    mode = (E("DOORBOSS_POSTCALL_MODE", "dry") or "dry").lower()
    pl = plan(rep, body)
    if mode != "live":
        _audit({"t": time.time(), "mode": "dry", "key": pl["key"], "by": rep.get("name")})
        return {"mode": "dry", "would_write": {"intake_form": pl["intake_form"], "property_updates": pl["property_updates"], "ghl": pl["ghl"]}, "note": "dry run: nothing written (DOORBOSS_POSTCALL_MODE=live to write)"}
    with _lock:
        st = _load()
        if pl.get("intake_id"): st[pl["key"]] = {"intake_id": pl["intake_id"], "t": time.time()}   # v48: update the intake the call was started from
        iid, how = _write_intake(rep, pl, st)
        st[pl["key"]] = {"intake_id": iid, "t": time.time()}; _save(st)   # QA 10/17: remembered the moment the row exists, so a later failure + retry updates instead of inserting twice
        prop_err = None
        try:
            for k, v in pl["property_updates"].items(): _sql("update properties set %s = %s, updated_at = now() where id = %s" % (k, RA._lit(v), RA._lit(pl["property"]["id"])))   # (empty in intake mode)
        except Exception as e: prop_err = type(e).__name__
        try: key = sf_key(); ghl = ({"updated": False, "reason": "GHL write-back is set up for Elite Solar Recovery only"} if not RA.esr_only(rep) else _write_ghl(pl, key) if key else {"updated": False, "reason": "no GHL key on this server"})
        except Exception as e: ghl = {"updated": False, "reason": "GHL step failed (%s)" % type(e).__name__}
        st[pl["key"]]["ghl"] = ghl.get("updated"); _save(st)
    _audit({"t": time.time(), "mode": "live", "key": pl["key"], "intake_id": iid, "how": how, "property_updates": list(pl["property_updates"]), "property_error": prop_err, "ghl": ghl, "by": rep.get("name")})
    return {"mode": "live", "intake_id": iid, "intake": how, "property_updates": pl["property_updates"], "property_error": prop_err, "ghl": ghl}

def complete_call(body, mode=None):   # kept for the old route signature
    return complete({"id": "", "name": "service", "email": ""}, body)
