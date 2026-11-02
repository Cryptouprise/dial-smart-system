"""Add a STRATEGY contract to lithos_worker.py (per-job "contract": "strategy"). Idempotent."""
import pathlib

p = pathlib.Path(r"C:\Users\charl\.claude\skills\lithos\lithos_worker.py")
s = p.read_text(encoding="utf-8")
if "STRATEGY_CONTRACT" in s:
    print("already patched")
    raise SystemExit(0)

STRAT = '''
STRATEGY_CONTRACT = """You are a strategy analyst for Infinite AI working under a foreman (a senior engineer who checks every line and makes every decision; you decide nothing).
Unlike the research contract you MAY use general industry knowledge (real-estate wholesaling, sales operations, telephony and texting compliance, SaaS pricing, lead data markets) in addition to the material.
Rules, in priority order:
1. Label every claim: FACT (it is in the material; cite path:line), INDUSTRY (general knowledge; add confidence high/medium/low), IDEA (your proposal). Never state something about THIS company's data, numbers or systems unless it is FACT.
2. Be concrete. Numbers carry their assumptions. Steps name the trigger, the actor (automation / AI / human), the data used and the failure mode. Use the tables, functions and tools the material shows; invent nothing about them.
3. Legal or regulatory points are flagged VERIFY-WITH-ATTORNEY and given as ranges or questions, never as settled fact.
4. Prefer the simplest path to the first dollar. Rank options by time-to-first-dollar, capital needed, risk and reversibility. Say plainly what needs a human decision.
5. Follow the OUTPUT FORMAT in the brief exactly. No pleasantries, no restating the brief, no filler.
6. Blanked secrets appear as <REDACTED>. Never guess them. Never ask for or reproduce personal data about any individual.
7. If the brief is ambiguous, pick the most literal reading, state the assumption in one line at the top, and continue."""
'''
anchor = "SECRET_PATTERNS = ["
assert anchor in s
s = s.replace(anchor, STRAT.lstrip("\n") + "\n" + anchor, 1)
old = 'system = BUILD_CONTRACT if job.get("contract") == "build" else CONTRACT'
assert old in s
s = s.replace(old, 'system = {"build": BUILD_CONTRACT, "strategy": STRATEGY_CONTRACT}.get(job.get("contract"), CONTRACT)', 1)
p.write_text(s, encoding="utf-8")
print("patched: STRATEGY_CONTRACT added, contract lookup now build|strategy|default")
