# main.ts refactor plan

`src/main.ts` grew to 3081 lines — one script closing over dozens of module-level
mutable arrays/refs (world, scene, blocks, balls, chars, camera, ui, party/grab/beam
state). This doc tracks splitting it into cohesive files, leaf-first, one commit per
step, zero behavior change. Tick boxes as steps land.

## Rules

- Pure move-and-wire per step. No drive-by cleanup, no new abstractions beyond what's
  needed to de-duplicate (see CLAUDE.md ground rules).
- Gate before every commit: `pnpm build` (tsc --noEmit + vite build) and `pnpm test`
  (vitest) both green. `pnpm lint` clean for anything the step touched.
- One commit per step, conventional message (`refactor: extract <thing> from main.ts`).
- No PRs, no pushes — local commits on `main` only.
- Order can be adjusted if the real code's dependencies differ from the guess below.

## Steps

- [x] 0. **entities.ts** (not in the original guess) — Entity/BlockEntity/BallEntity/
  Blaster/CharacterEntity/Owner/Phase types and makeEntityBase() move out of main.ts.
  They're shared by nearly every later step (crowd, characters-runtime, physics-step,
  grab); extracting them first avoids a circular-import tangle.
- [x] 1. **camera-runtime.ts** — orbitCamera, frameCamera, intro fly-in
  (startIntro/updateIntro/skipIntro), touchpad swipe/pinch wheel handler.
- [x] 2. **crowd.ts** — buildCrowd/stepCrowd/updateCrowd/poof/bonk/sendHome/resetCrowd,
  spectator array. Distinct from `characters.ts` (data/specs).
- [x] 3. **fireworks.ts** — rockets array, celebrate(), updateFireworks().
- [x] 4. **tool-fx.ts** — laser beam + hose jet: showBeam/castBeam/fireLaser,
  showJet/applyHose.
- [x] 5. **grab.ts** — pickBlock/beginGrab/applyGrabForce, grab highlight tint.
- [x] 6. **aim-input.ts** (may split into input-capture.ts + trajectory.ts) — pointer/
  touch/keyboard capture, charge tiers, launch(), trajectory arc, aim/grab/beam
  preview. Depends on steps 1, 4, 5. Done as one file (`createAimInput` + `createAimVisuals`).
  Scope notes: the target ring and trajectory arc are built by `createAimVisuals(scene)` before
  `createGrab`, because the grab tool draws with the same ring/arc and the aim input needs
  `createGrab`'s return values, so creating them inside `createAimInput` would be a cycle.
  `canThrow`, the tool predicates and `remoteHoldStart` stay in main.ts (the last is read via a
  getter), and `spraying` stays in main.ts behind get/set deps because the hose, tick and
  `clearLevel` also use it. Launch bookkeeping (throws used, party turn, last motion, stats) goes
  through an `onLaunched` callback, the same way grab uses `onPickUp`.
- [x] 7. **physics-step.ts** — scope reduced from the original guess: `stepPhysics` (the per-tick
  orchestrator), `finishIfDone`, `characterFell`, `popupFor`/`popupAt`, `syncRender` and
  `worldAsleep` stay in main.ts, since they reach into grab, hose, crowd, characters, scoring and
  level-completion. Moved as `createPhysicsStep`: the blast/impact machinery (scheduleBlast, ignite,
  blastEffects, countChain, detonate, triggerBlock, vanishAll, impactEffects, handleImpacts), its
  pending-blast/launch queues and chain/slow-mo state, and the two pending loops (now
  `processPending(simTime)`, called from `stepPhysics`). Beyond the listed return values it also
  returns `hasPendingBlasts` (the settle check counts only blasts) and `resetChain` (restart
  clears the chain). `randomDir` is a module export, since the gem trail in main.ts uses it too.
- [ ] 8. **characters-runtime.ts** — spawnCharacter, updateCharacters, near-miss/quip
  logic, get-up-if-fallen-over. (`characters.ts` stays data/specs only.)
- [ ] 9. **level-runtime.ts** — loadLevel/clearLevel/restart, party flow (startSolo/
  startParty/endPartyTurn/partyTopple/finishParty/announceTurn/refreshParty).
- [x] 10. **remote-ui.ts** — scope reduced from the original guess: only the QR/status
  slot panel (`refresh`/`updateStatus`/`forceRebuild`) moved out, as `createRemoteSlotPanel`.
  `handleRemote`, `remoteCommand` and `updateRemoteState` stay in main.ts — they're wired
  into party/phase/grab/spraying/launch state deeply enough that extracting them would
  mean threading ~15 getters/setters for no real decoupling, just code motion. Done
  alongside the TV-mode work (see `TV_MODE_PLAN.md`), which touched this same area anyway.
- [ ] 11. **hud-panels.ts** — mute/sound/lang/quality button wiring.
- [ ] 12. Final pass: confirm what's left in main.ts is bootstrap only (renderer/scene/
  world setup, entity arrays, wiring the extracted modules, the frame/tick loop).
  Target ~300-400 lines.

## Status

Execution handed to a background agent (one fork, all steps, committing as it goes).
Update this checklist and the line below once it reports back.
- Last known main.ts line count: 2152 (after step 6; 2491 after step 5; 3081 was the pre-refactor baseline)
- Manual browser smoke test (throw, grab, laser, hose, party mode) still required
  before this is trusted, per CLAUDE.md testing norms — automated gate is tsc+vitest
  only, no UI exercised during the mechanical move.
