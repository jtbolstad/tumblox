# Blox Topple — Boom Blox-inspired web game

Browser physics puzzle game inspired by Boom Blox (Wii, 2008): throw, grab and blast blocks to solve short puzzles.
Full research, game design and phased plan: see `PLAN.md`. Work through it phase by phase; tick checkboxes in `PLAN.md` as tasks land.

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

Phase 0 and 1 done; throw tuned for mouse (phone test over LAN still pending). Phase 2 started: 12 block types (`src/blocks.ts`), 5 tools incl. grab + Jenga goal (`src/tools.ts`), score pop-ups, 18 levels in `src/levels/` (generated once, now hand-editable JSON). Not yet: multiplier zones, Explore/Adventure sets, audio/particles/slow-mo, playtest tuning of difficulty and medal thresholds.
