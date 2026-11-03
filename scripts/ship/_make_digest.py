"""Build a condensed digest of the review swarm's findings.

Classifies every harvested node by its root ancestor (via node_meta.parent) so
the Dial Smart review lanes are separated from findings left over from earlier,
unrelated plans that share the same swarm state file.

Usage: python scripts/ship/_make_digest.py [--write]
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import _harvest_reports as H  # noqa: E402

# Roots that belong to the Dial Smart capability review (the lanes I seeded).
REVIEW_ROOTS = {
    "arch": "Architecture & modularity",
    "data": "Data model & migrations",
    "dialer": "Dialer / call paths",
    "integrations": "Integrations",
    "ai-layer": "AI layer",
    "quality": "Code quality",
    "scale": "Scale & performance",
    "security::seed-3350d144": "Security & tenancy",
    "ux": "UX & UI",
    "product": "Product & capability",
    "market": "Market & competition",
    "risks": "Launch risks",
    "skep-a": "Skeptic A",
    "skep-b": "Skeptic B",
    "skep-c": "Skeptic C",
    "synth-verdict": "Verdict",
    "synth-roadmap": "Roadmap",
    "synth-swarm": "Swarm plan",
}

MAX_EVIDENCE = 4
MAX_EV_LEN = 260
MAX_FIND_LEN = 900


def build():
    doc = H.load_plan()
    plan = doc["plan"]
    items = {it["id"]: it for it in plan.get("items", [])}
    meta = plan.get("node_meta", {})

    def root_of(nid):
        seen = set()
        cur = nid
        while cur and cur not in seen:
            seen.add(cur)
            m = meta.get(cur) or {}
            p = m.get("parent")
            if not p:
                return cur
            cur = p
        return cur

    groups = {r: [] for r in REVIEW_ROOTS}
    other = []

    for nid, it in sorted(items.items()):
        sid = it.get("assigned_to")
        if not sid:
            continue
        art, rep, tldr, calls, path = H.harvest_session(sid)
        if not (art or rep):
            continue
        r = root_of(nid)
        row = {"id": nid, "status": it.get("status"), "artifact": art,
               "report": rep, "tldr": tldr}
        if r in groups:
            groups[r].append(row)
        else:
            other.append(row)

    return groups, other


def render(groups, other):
    out = []
    out.append("# Dial Smart / DoorBoss - capability review digest\n")
    out.append("Condensed findings from a multi-model review swarm. Every line is a "
               "model-authored finding with file:line evidence. Confidence is the "
               "author's own self-report (low|medium|high).\n")
    total = sum(len(v) for v in groups.values())
    out.append(f"Nodes in this digest: {total} (review lanes). "
               f"Plus {len(other)} nodes from earlier unrelated plans (excluded).\n")

    for root, title in REVIEW_ROOTS.items():
        rows = groups.get(root) or []
        if not rows:
            continue
        out.append(f"\n## {title}  ({root})\n")
        for row in rows:
            art = row["artifact"] or {}
            conf = art.get("confidence", "-")
            head = (row["tldr"] or (row["report"] or "").strip().split("\n")[0] or "").strip()
            out.append(f"\n### {row['id']}  [{row['status']}, confidence={conf}]")
            if head:
                out.append(head[:MAX_FIND_LEN])
            ev = art.get("evidence")
            if isinstance(ev, list) and ev:
                out.append("")
                for e in ev[:MAX_EVIDENCE]:
                    out.append(f"- {str(e)[:MAX_EV_LEN]}")
            nk = art.get("what_i_did_not_check")
            if nk:
                if isinstance(nk, list):
                    nk = "; ".join(str(x) for x in nk[:3])
                out.append(f"- _not checked_: {str(nk)[:260]}")
    return "\n".join(out) + "\n"


def main():
    groups, other = build()
    text = render(groups, other)
    print(f"digest bytes: {len(text)}")
    print(f"review nodes: {sum(len(v) for v in groups.values())}")
    print("per lane:")
    for root, rows in groups.items():
        if rows:
            print(f"  {root:<26} {len(rows)}")
    print(f"excluded (other plans): {len(other)}")
    if "--write" in sys.argv:
        p = os.path.join(H.HOME, "dial-smart-system", "docs", "dial-smart-review-digest.md")
        with open(p, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        print("wrote", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
