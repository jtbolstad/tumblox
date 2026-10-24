# main.ts refactor plan, round 2

`src/main.ts` is 1580 lines after [MAIN_REFACTOR_PLAN.md](MAIN_REFACTOR_PLAN.md), which called
1579 lines "the orchestrator by design" and planned no further splitting. A second pass over the
file finds a few cohesive chunks that round 1's step list didn't name — not more orchestration,
just missed seams. This doc tracks extracting them, leaf-first, one commit per step, zero
behavior change.

## Rules

Same as round 1:

- Pure move-and-wire per step. No drive-by cleanup, no new abstractions beyond what's needed to
  de-duplicate (see CLAUDE.md ground rules).
- Gate before every commit: `pnpm build` (tsc --noEmit + vite build) and `pnpm test` (vitest)
  both green. `pnpm lint` clean for anything the step touched.
- One commit per step, conventional message (`refactor: extract <thing> from main.ts`).
- No PRs, no pushes — local commits on `main` only.

## Steps

- [x] 1. **world-theme.ts** — `applyProps`/`buildArenaColliders`/`applyTheme`/`applyStageLight`/
  `hashString`, plus their module state (`themeId`, `island`, `props`, `crowdSpots`, `propsKey`,
  `crowdSeed`, `windmillSails`, `arenaColliders`, `stageSpot`). Depends on scene/sky/background/
  fog/sun/rim/hemi/clouds/platformMat/renderer/world (all built earlier in main.ts) and on
  `buildCrowd` (crowd.ts) and `level` (read for `applyStageLight`'s pedestal height) — thread
  those in as constructor args/getters the way `camera-runtime.ts` and `crowd.ts` already do.
  `windmillSails` is read elsewhere in main.ts's animation tick (sail rotation) — export it or
  return a getter, whichever the call site needs.
- [x] 2. **gem-fx.ts** — `sparkleGems`/`updateTrails`, the `SHINY` table, and their module state
  (`sparklePos`, `sparkleClock`, `shinyMats`, `gemClock`, `trailPos`, `trailDir`). `shinyMats` is
  populated by `blockMaterial()` elsewhere in main.ts, so either export the array for main.ts to
  push into, or pass a `registerShiny` callback — match whichever pattern reads cleaner at the
  call site. Needs `quality`/`QUALITY_SETTINGS` (via getter, as other modules already do),
  `blocks`, `balls`, `glow`, `randomDir`.
- [x] 3. **debug-panel.ts** — the dev-only lil-gui block (`import.meta.env.DEV` branch). Fully
  self-contained: takes `world` and `params`, returns nothing. Lowest risk of the three, good
  first step to land if doing these out of order.

## Non-goals (re-affirmed from round 1)

- `handleRemote`/`remoteCommand`/`updateRemoteState` stay in main.ts — round 1 step 10 already
  evaluated and rejected extracting these (too many getters/setters into party/phase/grab/
  spraying/launch state for no real decoupling).
- `loadLevel`/`clearLevel`/`stepPhysics`/`finishIfDone` stay — they're the wiring seams between
  every already-extracted module, not leftover mess.

## Status

Done. main.ts: 1580 → 1400 lines. All three steps build/test/lint clean, one commit each.
Manual browser smoke test (level load, theme switch, title/result lighting, gems, debug panel)
still required.
