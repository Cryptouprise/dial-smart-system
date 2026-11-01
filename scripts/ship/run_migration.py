"""Run a migration file against the live project via the Supabase Management API.
  python run_migration.py <file.sql> --dry      # BEGIN; file; ROLLBACK (prints last SELECT if any)
  python run_migration.py <file.sql> --apply    # run file, then record in supabase_migrations.schema_migrations
Token is read from ~/.mcp.json at runtime and never printed."""
import sys, os, re, json, pathlib, urllib.request
REF = "emonjusymdripmkvtttc"
tok = re.search(r"(sbp_[A-Za-z0-9]+)", open(os.path.expanduser("~/.mcp.json"), encoding="utf-8").read()).group(1)
def q(sql):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query", method="POST",
        data=json.dumps({"query": sql}).encode(), headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r: return r.status, r.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
path = pathlib.Path(sys.argv[1]); mode = sys.argv[2]
sql = path.read_text(encoding="utf-8")
version, name = path.stem.split("_", 1)
if mode == "--dry":
    st, body = q("BEGIN;\n" + sql + "\nROLLBACK;")
    print("DRY", path.name, "HTTP", st, body[:600])
elif mode == "--apply":
    st, body = q(sql)
    print("APPLY", path.name, "HTTP", st, body[:400])
    if st == 200 or st == 201:
        rec = "INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES (%s, %s, ARRAY[%s]) ON CONFLICT (version) DO NOTHING" % (
            "'" + version + "'", "'" + name.replace("'", "''") + "'", "'" + sql.replace("'", "''") + "'")
        st2, body2 = q(rec); print("RECORD HTTP", st2, body2[:200])
