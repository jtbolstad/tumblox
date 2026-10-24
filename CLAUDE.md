# Tumble — Boom Blox-inspired web game

Browser physics puzzle game inspired by Boom Blox (Wii, 2008): throw, grab and blast blocks to solve short puzzles.
Full research, game design and phased plan: see `docs/PLAN.md`. Work through it phase by phase; tick checkboxes in `docs/PLAN.md` as tasks land.
Look/sound/feel pass (art, characters, music, name, logo, launch page): see `docs/ART_PLAN.md`.

## Stack (decided)

- TypeScript + Vite, static site (no backend)
- Three.js for rendering (InstancedMesh per block type)
- Rapier3D via `@dimforge/rapier3d-compat` for physics (fixed 60 Hz step, render interpolation)
- HUD/menus/editor as HTML overlay
- Vitest for rules (goals, scoring), Playwright smoke test
- lil-gui debug panel during development

## Source layout

`src/` is grouped by role: `data/` (level/block/theme/tool schema and game rules), `input/`
(flick/grab/aim), `runtime/` (the physics-step/level-runtime glue), `render/` (scene, props,
materials, world dressing), `characters/`, `fx/`, `audio/`, `ui/`, `remote/` (the phone remote,
both sides). The three HTML entry points — `main.ts` (game), `about.ts` (launch page),
`controller.ts` (phone remote page) — stay at `src/` root. `src/levels/` holds the bundled JSON
levels.

## Ground rules

- Do not move past Phase 0 until the flick-to-throw feels good on mouse and touch.
- Mechanics are cloned; name, characters, art, audio and levels must be original. Never use EA assets or the "Boom Blox" name in the shipped game.
- Levels are JSON (schema in `docs/PLAN.md`); editor, share links and hand-made levels use the same format.
- Block types are data (mass, friction, restitution, look) + optional behaviour hooks fed by Rapier collision events.
- Evaluate goals only after the scene settles (all bodies asleep, or 2 s without motion).
- Stacks spawn asleep; solver iterations 8+; low restitution.
- `provencher/repoblocks` (GPL-3.0) is a reference — copying its code makes this project GPL. Ask before copying.

## Commands

- `pnpm dev` — dev server
- `pnpm build` — production build (game plus `about.html` launch page)
- `pnpm test` — Vitest
- `pnpm shots` — screenshots of fixed level views into `shots/` (after `pnpm build`; uses system Chromium)
- `pnpm brand` — regenerate `public/logo.svg` and the app icons from `src/render/glyphs.ts`
- `pnpm hero` — re-record the launch-page clip `public/hero.mp4` (after `pnpm build`; needs ffmpeg)

## Current status

Phase 0 and 1 done; throw tuned for mouse (phone test over LAN still pending). Phase 2 mostly done: 16 block types, 7 tools (ball, heavy, bomb, bouncy, grab, laser, hose), Jenga goal, multiplier zones, slow-mo on chains, score pop-ups, synthesised sound and music (`src/audio/audio.ts`, `src/audio/music.ts`), particles and camera shake (`src/fx/fx.ts`), 31 hand-editable JSON levels in `src/levels/`. Phase 4 mostly done: hot-seat party (score duel, Jenga-off; `src/data/party.ts`), laser/hose, quality setting and sleep-based physics pause, PWA (`public/`), keyboard play (arrows + Space, Q/E orbit), shape markings on blocks (`src/render/marks.ts`). Look pass (`docs/ART_PLAN.md`): stages A (materials, light, island), B (effects, chain bonus, camera moves), F (name Tumble, logo, title scene, launch page), C (six worlds via level `theme`, props, world-map menu, including Pirate Cove), D (cube-animal and human characters: friends to protect, rivals worth points, decor; `src/characters/characters.ts`) and E (a synthesised track per world in `src/audio/music.ts`, instruments in `src/audio/synth.ts`, stingers, ambience, volume panel) and G (arena of giant pastel blocks with a reacting crowd, arms with wave/dance moves; spectators wear world costumes, dance to the music beat and can be bonked by balls) done. Each level opens with a brief banner (`src/ui/brief.ts`). Touchpad: two-finger swipe orbits; a one-finger orbit mode toggles on touch devices via the 🔄 HUD button (`#orbit-btn`). Phone remote and canvas/touchpad throws can charge by swipe speed or by a held press (like holding Space), via `holdMs` in `src/remote/remote-protocol.ts` and `chargeTier` in `src/input/throw.ts`. Hot-seat party games support one phone per player: each player's QR code carries their slot in the URL hash (`remote.html#hostId:slot`), and only the phone whose slot matches `party.current` controls the game (`src/remote/remote.ts`, `src/controller.ts`). Each level nudges the world's music track by a small key/tempo variant (`setTrack` in `src/audio/music.ts`) so levels in the same world don't sound identical. Pirate Cove's arena is one big galleon instead of giant blocks (`pirateShip` in `src/render/props.ts`); worlds with a sea bob their island gently (`src/render/world-theme.ts`); a big bird occasionally wings across the sky (`src/render/sky-event.ts`) and a win sometimes starts a ring dance around the pedestal (`src/characters/crowd.ts`). Medal thresholds on levels with rivals have not been retuned for the extra 150 points. Not yet: Explore tutorial sets and Adventure worlds, playtest tuning of difficulty and medal thresholds (levels 25-31 are untuned). Sound, music, particles, the new orbit/charge/multiplayer-remote controls and the PWA install flow are untested by ear/eye/hand on a real device.
