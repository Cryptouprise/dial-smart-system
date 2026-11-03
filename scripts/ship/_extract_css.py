"""Extract the DoorBoss stylesheet and namespace it under `.d2d-root`.

The point of this file is visual identity. DoorBoss's look lives in ~350 lines of
hand-written CSS. Re-expressing that in Tailwind would never match, so we keep the
CSS verbatim and only scope it, which also stops its generic class names (`.pill`,
`.tab`, `.sheet`, `.card`) from colliding with Dial Smart's Tailwind/shadcn styles.

Rules:
  * comments are stripped first, so a banner can never end up inside a selector
  * `:root`, `html`, `body` (and `:root:not(...)`, `body.dark`) -> `.d2d-root...`
  * everything else            -> prefixed with `.d2d-root `
  * `@media` / `@supports`     -> recursed into
  * `@keyframes`, `@font-face`, `@import`, `@charset` -> copied verbatim

Writes src/packs/door_to_door/doorboss.css and prints a summary for review.
"""
import os
import re
import sys

SRC = os.path.join("docs", "wholesale", "doorboss-app", "index.prod.html")
OUT = os.path.join("src", "packs", "door_to_door", "doorboss.css")

ROOT = ".d2d-root"
VERBATIM_AT = ("@keyframes", "@font-face", "@import", "@charset", "@-webkit-keyframes")
RECURSE_AT = ("@media", "@supports", "@layer", "@container")
PAGE_SELECTORS = (":root", "html", "body")


def extract_style(html: str) -> str:
    blocks = re.findall(r"<style[^>]*>(.*?)</style>", html, re.S | re.I)
    if not blocks:
        raise SystemExit("no <style> block found")
    return "\n\n".join(b.strip() for b in blocks)


def strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", " ", css, flags=re.S)


def split_selector_list(selector_text: str) -> list[str]:
    """Split on top-level commas only, so `:is(a,b)` and `:not(a,b)` stay whole."""
    parts: list[str] = []
    depth = 0
    current: list[str] = []
    for ch in selector_text:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(ch)
    parts.append("".join(current))
    return [p.strip() for p in parts if p.strip()]


def scope_selector(selector: str) -> str:
    sel = selector.strip()
    if not sel:
        return sel

    for page in PAGE_SELECTORS:
        if sel == page:
            return ROOT
        if sel.startswith(page):
            rest = sel[len(page) :]
            # only a real boundary counts: `.` `:` `[` ` ` `>` `+` `~`
            if rest and rest[0] in ".:[ >+~":
                rest = rest.lstrip()
                if not rest:
                    return ROOT
                if selector.strip()[len(page)] == " ":
                    return f"{ROOT} {rest}"
                return f"{ROOT}{rest}"

    return f"{ROOT} {sel}"


def transform(css: str) -> str:
    """Walk the stylesheet and rewrite selectors. Handles one level of at-rules."""
    out: list[str] = []
    i = 0
    n = len(css)
    buf_start = 0

    while i < n:
        ch = css[i]

        if ch == "{":
            prelude = css[buf_start:i].strip()
            j = i + 1
            level = 1
            while j < n and level:
                if css[j] == "{":
                    level += 1
                elif css[j] == "}":
                    level -= 1
                j += 1
            body = css[i + 1 : j - 1]

            low = prelude.lower()
            if any(low.startswith(a) for a in VERBATIM_AT):
                out.append(f"{prelude}{{{body}}}")
            elif any(low.startswith(a) for a in RECURSE_AT):
                out.append(f"{prelude}{{{transform(body)}}}")
            else:
                scoped = ", ".join(scope_selector(s) for s in split_selector_list(prelude))
                out.append(f"{scoped}{{{body}}}")

            i = j
            buf_start = j
            continue

        i += 1

    return "".join(out)


def audit(scoped: str) -> list[str]:
    """Every top-level rule must be @-prefixed or start with .d2d-root."""
    bad: list[str] = []
    i = 0
    n = len(scoped)
    buf_start = 0
    while i < n:
        if scoped[i] == "{":
            prelude = scoped[buf_start:i].strip()
            if prelude and not prelude.startswith(ROOT) and not prelude.startswith("@"):
                bad.append(prelude[:110])
            j = i + 1
            level = 1
            while j < n and level:
                if scoped[j] == "{":
                    level += 1
                elif scoped[j] == "}":
                    level -= 1
                j += 1
            i = j
            buf_start = j
            continue
        i += 1
    return bad


def main() -> int:
    with open(SRC, "r", encoding="utf-8", errors="replace") as fh:
        html = fh.read()

    raw = strip_comments(extract_style(html))
    scoped = transform(raw)

    header = (
        "/* DoorBoss stylesheet, ported verbatim and scoped under .d2d-root.\n"
        " *\n"
        " * Source: docs/wholesale/doorboss-app/index.prod.html (451891 bytes,\n"
        " * sha256 63b7a1711b62de65, byte-identical to the live DoorBoss app).\n"
        " *\n"
        " * Generated by scripts/ship/_extract_css.py. Do not hand-edit: re-run the\n"
        " * extractor so the port keeps matching DoorBoss. Only two things differ from\n"
        " * the original: comments are dropped, and every selector is scoped under\n"
        " * .d2d-root (:root/html/body become .d2d-root itself).\n"
        " */\n\n"
    )

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(header + scoped + "\n")

    bad = audit(scoped)
    print(f"raw css      : {len(raw)} chars")
    print(f"scoped css   : {len(scoped)} chars, {scoped.count('{')} rules")
    print(f"unscoped     : {len(bad)} rules (must be 0)")
    for b in bad[:12]:
        print(f"   ! {b}")
    print(f"wrote        : {OUT}")
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
