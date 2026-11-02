"""Read-only: show the telnyx MCP server definition with any credential values masked.

Never prints a secret. Used to find why the telnyx MCP server will not connect and
where its credentials come from.
"""
import json
import pathlib
import re

MASK = re.compile(r"key|token|secret|pass|auth", re.I)
CREDENTIAL = re.compile(r"\b(KEY|sk|pk|whsec|Bearer)[A-Za-z0-9_\-]{12,}", re.I)


def mask(key: str, value):
    if isinstance(value, dict):
        return {k: mask(k, v) for k, v in value.items()}
    if isinstance(value, list):
        # An array is often the argv of a process: the secret is inside it, not in the
        # key name. Mask any element that looks like a credential, and any element
        # following an Authorization/--header style flag.
        out = []
        for item in value:
            if isinstance(item, str) and (
                "authorization" in item.lower()
                or "bearer " in item.lower()
                or CREDENTIAL.search(item)
            ):
                out.append("<masked>")
            else:
                out.append(mask(key, item))
        return out
    if MASK.search(key):
        if isinstance(value, str):
            return f"<masked len={len(value)}>"
        return "<masked>"
    return value


def main() -> None:
    home = pathlib.Path.home()
    for path in (home / ".jcode" / "mcp.json", home / ".mcp.json"):
        if not path.exists():
            print(f"{path}: MISSING")
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
        except Exception as exc:  # noqa: BLE001
            print(f"{path}: unreadable ({type(exc).__name__})")
            continue
        servers = data.get("mcpServers", data)
        print(f"{path}: {len(servers)} servers -> {sorted(servers)}")
        entry = servers.get("telnyx")
        if entry is None:
            print("  telnyx: NOT DEFINED HERE")
        else:
            print("  telnyx entry (masked):")
            print("   " + json.dumps(mask("", entry), indent=1).replace("\n", "\n   "))


if __name__ == "__main__":
    main()
