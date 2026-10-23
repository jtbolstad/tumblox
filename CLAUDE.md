# Blox Topple — Boom Blox-inspired web game

Browser physics puzzle game inspired by Boom Blox (Wii, 2008): throw, grab and blast blocks to solve short puzzles.
Full research, game design and phased plan: see `PLAN.md`. Work through it phase by phase; tick checkboxes in `PLAN.md` as tasks land.
Look/sound/feel pass (art, characters, music, name, logo, launch page): see `ART_PLAN.md`.

## Stack (decided)

- TypeScript + Vite, static site (no backend)
- Three.js for rendering (InstancedMesh per block type)
- Rapier3D via `@dimforge/rapier3d-compat` for physics (fixed 60 Hz step, render interpolation)
- HUD/menus/editor as HTML overlay
- Vitest for rules (goals, scoring), Playwright smoke test
- lil-gui debug panel during development

## Ground rules

- Do not move past Phase 0 until the flick-to-throw feels good on mouse and touch.
- Mechanics are cloned; name, characters, art, audio and levels must be original. Never use EA assets or the "Boom Blox" name in the shipped game.
- Levels are JSON (schema in `PLAN.md`); editor, share links and hand-made levels use the same format.
- Block types are data (mass, friction, restitution, look) + optional behaviour hooks fed by Rapier collision events.
- Evaluate goals only after the scene settles (all bodies asleep, or 2 s without motion).
- Stacks spawn asleep; solver iterations 8+; low restitution.
- `provencher/repoblocks` (GPL-3.0) is a reference — copying its code makes this project GPL. Ask before copying.

## Commands (once scaffolded)

- `pnpm dev` — dev server
- `pnpm build` — production build
- `pnpm test` — Vitest

## Current status

Phase 0 and 1 done; throw tuned for mouse (phone test over LAN still pending). Phase 2 mostly done: 16 block types, 7 tools (ball, heavy, bomb, bouncy, grab, laser, hose), Jenga goal, multiplier zones, slow-mo on chains, score pop-ups, synthesised sound and music (`src/audio.ts`, `src/music.ts`), particles and camera shake (`src/fx.ts`), 28 hand-editable JSON levels in `src/levels/`. Phase 4 mostly done: hot-seat party (score duel, Jenga-off; `src/party.ts`), laser/hose, quality setting and sleep-based physics pause, PWA (`public/`), keyboard play (arrows + Space, Q/E orbit), shape markings on blocks (`src/marks.ts`). Not yet: Explore tutorial sets and Adventure worlds (so also the last 2 worlds), final name/logo/art, launch page, playtest tuning of difficulty and medal thresholds (levels 25-28 are untuned). Sound, music, particles and the PWA install flow are untested by ear/eye on a real device.
