# REA (Reverse Engineer Anything) - dissection, 2026-10-28 (card P1745)

Source: Charles's video https://youtu.be/cHPWA4omJD8 (lustoykov, 2026-10-10, "REA #1 on GitHub"), transcript read by Fable; repo and docs read by research agent `rea-dissect`.

## What it is
- Repo: https://github.com/morluto/rea (the only real one; `rea-agents` on npm). MIT license (commercial use OK). ~400K stars, created Apr 2026, anonymous owner, 100+ contributors.
- An MCP server + skill that sits between a coding agent (Claude Code, Codex, Cursor, Gemini CLI) and real reverse-engineering tools:
  Ghidra, IDA, Hopper, Kuna, JEB, JADX, Apktool, objdump, Rizin. Targets: native binaries, JS/Electron, .NET, APKs, firmware, packet captures, websites.
- Needs Node 22; native work needs a decompiler installed separately; Android needs JADX + JDK. Setup edits your MCP client config.
- Analyzes locally; results go to whatever model your agent uses. Tool list ~1.95 MB of agent context.
- Showcase: DX-Ball 1996 (55 C functions rebuilt from bytes), Notion desktop clipboard path, Touhou 4 DOS executable.
- Own DISCLAIMER: only software you own or are authorized to examine; refuses DRM / license-check / auth bypass.

## Evidence it does not help much
- The video's own test: same agent, same APK, WITHOUT REA won: 6 min vs 10, 24 vs 40 tool calls, 1.5M vs 5M tokens, same correct answer.
- Hackernoon test on a 100 MB Electron app: fast (52 s) but found 0 of 2 preload entrypoints, dropped 365 file connections, missed a sender check.

## 🚨 Fakes
`ReverseEngineer-Anything/REA-Github` and `REA-Gith/REA` are keyword-stuffed pages pushing a Windows "6.3.0" zip. Unverified as malicious; never install. Only `morluto/rea` / npm `rea-agents`.

## Fit for Infinite AI (Fable's verdict)
- We own the source to everything we sell. Nothing to decompile. REA adds nothing to the dialer build.
- Legit edge cases (vendor Electron bundle we're licensed to use, our own shipped bundles for leaked keys) are already doable with a normal agent + grep/DevTools.
- Pointing it at a competitor's or vendor's software = ToS breach (account termination risk with GHL), DMCA 1201 exposure, CFAA if it touches live servers, copyright/trade-secret if we reimplement from decompiled code. Agent did not research case law; counsel would confirm. Our no-copy rule already matches REA's own disclaimer.
- Decision: SKIP. Revisit only if we ever hit a native binary or a hostile minified bundle, then sandbox it in a throwaway profile.

## Patterns worth stealing for our own agents
1. Preview planned changes before writing (their setup does this).
2. "No match is not proof of absence" wording in tool output -> copy into call-analysis and lead-QA agents.
3. Verify a rebuilt behavior against the original across thousands of inputs -> regression checks for dialer/coach logic.
4. Pin the source artifact by hash -> pin Retell/Assistable prompt versions.
5. Big tool lists burn tokens -> keep our MCP tool surfaces small.
