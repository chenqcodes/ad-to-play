# 拉针救援 / Lava Ruins

Original, dependency-free mobile puzzle at `/games/pin-rescue/`. The game world uses original inline SVG explorer, gem, water, flame and chamber art. Interface accents use platform emoji. No external assets, fonts, analytics, accounts or network calls.

## Play
Tap numbered gold pin handles. Contents move downhill along the visible channels. Each water cancels one lava; excess water continues to flow. Lava destroys an explorer or gemstone on contact. Cool all lava in the ruins and bring the explorer and every gemstone safely to the bottom exit. Ten levels unlock sequentially; each has a solver-verified solution. Undo and restart are immediate, unlimited and free. Hints compute a next move from the current state, not a canned solution. Sound defaults off; reduced motion follows the OS and has a manual toggle. Progress is local to this browser; denied or full storage falls back to session play.

## Verify
`node --test games/pin-rescue/test/*.test.mjs`
`node --check games/pin-rescue/main.mjs`

The pure engine tests every level's reachability and every order of pin pulls, loss/undo snapshots, invalid or repeated input, deterministic water/lava cancellation, acyclic downhill paths and malformed/denied storage. Browser QA is tracked in the root verification document.

## Integration
Copy the whole `games/` directory into the static build output. No package dependencies or service worker required. Root navigation returns to `/`.
