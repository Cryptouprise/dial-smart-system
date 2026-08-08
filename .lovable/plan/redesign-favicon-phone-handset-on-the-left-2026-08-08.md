# Redesign Favicon — Phone Handset on the Left

## Current state
The favicon/logo (`public/favicon.png`, `apple-touch-icon.png`, `pwa-192x192.png`, `pwa-512x512.png`) is a blue-gradient rounded square with a brain graphic and a phone handset. The phone is currently positioned on the right side of the design.

## Goal
Regenerate the icon so the **phone handset is on the left side**, keeping the same blue-gradient + brain concept and brand identity. The result must read clearly at small (favicon) size.

## Plan
1. Generate a single new square logo image (1024×1024, transparent background) with the phone handset on the left side of the brain, same blue gradient palette and "Dial Smart / Call Boss" brand feel.
2. Derive all icon variants from that one source, downscaling/padding to square:
   - `public/favicon.png` — 64×64
   - `public/apple-touch-icon.png` — 180×180
   - `public/pwa-192x192.png` — 192×192
   - `public/pwa-512x512.png` — 512×512
3. `index.html` already references `/favicon.png` and `/apple-touch-icon.png` — no markup change needed unless a mask-icon type changes.
4. Verify the build still passes.

## Non-goals
- No changes to site layout, navigation, or copy — only the icon assets.
- No multiple candidate variants; one final favicon.
