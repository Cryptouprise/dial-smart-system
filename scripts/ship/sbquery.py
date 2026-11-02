"""Ad-hoc SQL against the live Supabase project via the Management API.
  python sbquery.py "select 1"
  echo "select 1" | python sbquery.py -
Token is read from ~/.mcp.json at runtime and never printed."""
import sys, os, re, json, urllib.request, urllib.error

REF = "emonjusymdripmkvtttc"
tok = re.search(r"(sbp_[A-Za-z0-9]+)", open(os.path.expanduser("~/.mcp.json"), encoding="utf-8").read()).group(1)
sql = sys.stdin.read() if (len(sys.argv) > 1 and sys.argv[1] == "-") else sys.argv[1]
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{REF}/database/query",
    method="POST",
    data=json.dumps({"query": sql}).encode(),
    headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
)
try:
    with urllib.request.urlopen(req, timeout=300) as r:
        print(r.status, r.read().decode())
except urllib.error.HTTPError as e:
    print(e.code, e.read().decode())
