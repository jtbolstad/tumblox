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

- [x] 1. **camera-runtime.ts** — orbitCamera, frameCamera, intro fly-in
  (startIntro/updateIntro/skipIntro), touchpad swipe/pinch wheel handler.
- [ ] 2. **crowd.ts** — buildCrowd/stepCrowd/updateCrowd/poof/bonk/sendHome/resetCrowd,
  spectator array. Distinct from `characters.ts` (data/specs).
- [x] 3. **fireworks.ts** — rockets array, celebrate(), updateFireworks().
- [ ] 4. **tool-fx.ts** — laser beam + hose jet: showBeam/castBeam/fireLaser,
  showJet/applyHose.
- [ ] 5. **grab.ts** — pickBlock/beginGrab/applyGrabForce, grab highlight tint.
- [ ] 6. **aim-input.ts** (may split into input-capture.ts + trajectory.ts) — pointer/
  touch/keyboard capture, charge tiers, launch(), trajectory arc, aim/grab/beam
  preview. Depends on steps 1, 4, 5.
- [ ] 7. **physics-step.ts** — stepPhysics, handleImpacts, detonate/triggerBlock/
  blastEffects, impact sfx/fx, chain counting.
- [ ] 8. **characters-runtime.ts** — spawnCharacter, updateCharacters, near-miss/quip
  logic, get-up-if-fallen-over. (`characters.ts` stays data/specs only.)
- [ ] 9. **level-runtime.ts** — loadLevel/clearLevel/restart, party flow (startSolo/
  startParty/endPartyTurn/partyTopple/finishParty/announceTurn/refreshParty).
- [ ] 10. **remote-ui.ts** — slot panel refresh, handleRemote, updateRemoteState glue
  (remote.ts/remote-protocol.ts stay as-is; this is just main-side wiring).
- [ ] 11. **hud-panels.ts** — mute/sound/lang/quality button wiring.
- [ ] 12. Final pass: confirm what's left in main.ts is bootstrap only (renderer/scene/
  world setup, entity arrays, wiring the extracted modules, the frame/tick loop).
  Target ~300-400 lines.

## Status

Execution handed to a background agent (one fork, all steps, committing as it goes).
Update this checklist and the line below once it reports back.
- Last known main.ts line count: 3081 (pre-refactor baseline)
- Manual browser smoke test (throw, grab, laser, hose, party mode) still required
  before this is trusted, per CLAUDE.md testing norms — automated gate is tsc+vitest
  only, no UI exercised during the mechanical move.
