# Look, Sound & Feel Plan

As of 2026-10-24 · Companion to `docs/PLAN.md` (replaces its Phase 4 line "Final name, logo, original art and music; launch page")

## Summary

The gameplay works, but the game still looks like a prototype: flat-coloured boxes, a green disc for ground, a plain sky, a beeping music loop and a debug HUD. This plan turns it into a bright toy diorama with characterful cube animals, layered destruction effects, a soundtrack per world, and a real name, logo and title screen.
- **Direction:** "toy diorama". Every level is a small floating island; blocks are painted wooden toys; the block colour code always wins over decoration.
- **Everything is made in code:** textures painted on canvas, props and characters built from primitives, music and sound synthesised. Nothing to license, and it all works offline.
- **Order:** materials and light first (biggest win for the least work), then juice, then name/logo/title screen, then worlds, characters and music.
- **Gate per stage:** before/after screenshots per theme, plus a play session on desktop and phone.

## What the original felt like

This summary comes from reviews and previews; footage hasn't been reviewed yet. Watch the YouTube links in `docs/PLAN.md` ("Reference media") and note anything below that doesn't match.

| Area        | What reviewers saw                                                                                                                                                                                                                                                                                                                                                                                                                             | Take for us                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Look        | "Bright, clear and simple"; every block identifiable at a glance; unobtrusive backgrounds ([Pocket Gamer](https://www.pocketgamer.com/steven-spielbergs-boom-blox/review/)). "Colours galore", "neat and inoffensive" ([Cubed3](https://www.cubed3.com/games/reviews/wii/boom-blox)). Very bright palette, well-defined textures ([Everyeye](https://www.everyeye.it/articoli/anteprima-boom-blox-7563.html))                                  | Saturated, readable blocks; calm backgrounds                        |
| Criticism   | "Simple, colorful, and bland"; slowdown during explosions and camera moves ([Nintendo World Report](https://www.nintendoworldreport.com/review/15982/boom-blox-wii))                                                                                                                                                                                                                                                                           | Aim higher on materials and light; keep a strict performance budget |
| Characters  | Cube-shaped animals (cows, bears, sheep, monkeys on the title screen); 31 in total; they wander, dance, lay blocks, throw things ([Cubed3](https://www.cubed3.com/games/reviews/wii/boom-blox), [Time Extension](https://www.timeextension.com/games/wii/boom_blox)). Spielberg added them because bare levels felt empty ([Everyeye](https://www.everyeye.it/articoli/anteprima-boom-blox-7563.html))                                         | Characters are what makes the levels feel alive                     |
| Worlds      | Tiki, Medieval, Frontier, Haunted ([Wikipedia](https://en.wikipedia.org/wiki/Boom_Blox))                                                                                                                                                                                                                                                                                                                                                       | Five original themes (below)                                        |
| Destruction | "Thunderous" explosions, chain reactions, a bullet-time view of collapses ([Everyeye](https://www.everyeye.it/articoli/anteprima-boom-blox-7563.html)); praised physics sounds — nearly everything makes a sound                                                                                                                                                                                                                               | Layered explosions, slow-mo push-in, a sound for every contact      |
| Menus       | Menu items are blocks you can push around ([Cubed3](https://www.cubed3.com/games/reviews/wii/boom-blox)); video previews that hide the screen were disliked ([NWR](https://www.nintendoworldreport.com/review/15982/boom-blox-wii))                                                                                                                                                                                                            | Playable title screen; no previews covering the UI                  |
| Music       | Mothersbaugh and co-composers. Main theme with tribal percussion, playful and goofy; "Powdered Wig" an Irish-folk jig; country tracks such as "Blocks Up Hoe Down"; "Fear Anytime" eerie; "Ready, Set, Edit" mellow and funky ([OSV](http://www.originalsoundversion.com/bang-for-the-blocks-boom-blox-soundtrack-review/)). Some found it tiresome over long sessions ([NWR](https://www.nintendoworldreport.com/review/15982/boom-blox-wii)) | One genre per world, A/B sections, adaptive layers                  |
| Voices      | A character's voice compared to the Hamster Dance ([NWR](https://www.nintendoworldreport.com/review/15982/boom-blox-wii))                                                                                                                                                                                                                                                                                                                      | Soft, short, rate-limited voices with their own volume              |

## Art direction

**Pillars**
1. A small toy island floating in a soft sky, framed like a diorama.
2. Blocks are painted wooden toys with bevelled edges and visible material.
3. The block colour code is sacred: gameplay colours and shape markings always win over decoration.
4. Every hit gives feedback: sound, dust, a pop, a shake.
5. 60 fps on a mid-range phone at Medium quality.

**Palette** (shared by the 3D scene and the HTML UI; current block colours stay)

| Token                 | Hex                               | Use                             |
| --------------------- | --------------------------------- | ------------------------------- |
| ink                   | `#023047`                         | text, outlines                  |
| sky-top / sky-horizon | `#5fa8d3` / `#cfeaf6`             | meadow sky gradient             |
| accent                | `#fb8500`                         | buttons, score pops             |
| grass                 | `#7bc47f`                         | meadow island top               |
| earth                 | `#b08968`                         | platform, island sides          |
| gem / point / bomb    | `#3da5ff` / `#ffc400` / `#e63946` | from `src/blocks.ts`, unchanged |

Each theme adds its own sky, island and prop colours without touching block colours.

**Do / don't**
- Do: original characters, names, music and levels; describe the game as "inspired by Boom Blox".
- Don't: EA assets, screenshots or audio; "Boom" or "Blox" in the final name; copies of the original's specific characters (sheep knights, gorilla mother, beaver miner, kittens).

## Stages

### A. Materials and light

- [x] Bevelled blocks with `RoundedBoxGeometry` (`three/examples/jsm/geometries/RoundedBoxGeometry.js`); keep one `InstancedMesh` per block type (`loadLevel` in `src/main.ts`)
- [x] Canvas-painted material per block type (`blockTexture()` in `src/marks.ts`) so the shape markings stay: wood grain, brushed steel, frosted ice, faceted gem, gold point block with an embossed "100", bomb with fuse, chemical with bubbles
- [x] Gem glints (drifting particles); metallic point blocks
- [x] Tone mapping (Neutral: AgX/ACES washed out the toy colours), warm key light, cool rim light, hemisphere fill
- [x] Gradient sky shader, low-poly clouds, fog matched to the horizon, soft contact-shadow blob under the pedestal, sky-based environment lighting
- [x] Island base instead of the flat disc: grassy top, earthy sides, floating in the sky
- [x] Quality tiers (`QUALITY_SETTINGS` in `src/main.ts`) gain toggles for the extras (rim light, glints)

### B. Juice and camera

- [x] Layered explosions on top of `Particles` / `Shake` in `src/fx.ts`: flash sprite, shockwave ring, smoke puffs, chunky debris (all pooled)
- [x] Dust puffs on heavy impacts, vanish "poof", gem sparkle trail, ball motion trail
- [x] Brief squash on blocks the ball hits
- [x] "CHAIN ×4!" counter with a combo bonus (25 per blast from the third, `chainBonus` in `src/rules.ts`); slow-mo (`slowUntil`) adds a camera push-in for a bullet-time feel
- [x] Level intro: 2 s orbit fly-in ending at the `frameCamera()` pose, skippable with any input
- [x] Win: slow orbit behind the medal screen
- [x] Styled score pops: bigger, bouncier, coloured by block type

### C. Worlds

Driven by the existing `theme` field in `src/level.ts`. Props are decoration only: no colliders, outside the play area, merged into one draw call per theme.

| Theme                  | Sky and island                          | Props (built from primitives)                      | Music                                     |
| ---------------------- | --------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| Meadow (Explore, menu) | blue sky, grassy island                 | trees, flowers, fence, windmill                    | bouncy marimba and tuba                   |
| Tiki Isle              | sunset, sandy island in a turquoise sea | palms, torches, totems, huts                       | log drums and plucked strings             |
| Castle Hill            | morning sky, green hill                 | banners, towers, drawbridge, hay bales             | recorder-and-lute jig in 6/8              |
| Dusty Gulch            | hot orange sky, red rock mesa           | cacti, barrels, water tower, cow skull             | banjo hoedown in 2/4                      |
| Spooky Manor           | purple night, moon                      | tombstones, pumpkins, dead trees, manor silhouette | minor harpsichord waltz with a "theremin" |
| Pirate Cove            | overcast sky, sandy island in a teal sea | shipwreck, palms, barrels, treasure chests         | swung fiddle sea shanty over banjo        |
- [x] Theme system: sky colours, island materials, light, pedestal, prop set, distant scenery (`src/themes.ts`, `src/props.ts`); music track and ambient sound bed per world moved to stage E
- [x] Six themes; existing levels regrouped into worlds (Meadow 1–6, Tiki 7–12, Castle 13–18, Gulch 19–24, Manor 25–28, Pirate Cove 29–31); the Explore/Adventure structure in `docs/PLAN.md` Phase 2 is still open
- [x] World map with level isles instead of the card grid (moved here from stage F)

### D. Characters (cube animals)

Built in code from boxes (body, head, ears, eyes, snout): original, and no asset pipeline needed.

| World        | Example species       |
| ------------ | --------------------- |
| Meadow       | goat, hen             |
| Tiki Isle    | frog, parrot          |
| Castle Hill  | pig squire            |
| Dusty Gulch  | armadillo             |
| Spooky Manor | bat, ghost-sheet blob |
| Pirate Cove  | human villager        |

A human villager (`human` in `CHARACTER_IDS`) now crowds every world, dressed in that world's hat/costume via `costume()` in `src/characters.ts`; in Pirate Cove it's the native species (tricorn hat, sash).
- [x] Each character is one dynamic Rapier box body; child meshes carry a procedural animation state machine (`src/characters.ts`; knocked-over characters hop back onto their feet):
  - idle: bob, blink, look at the cursor or ball
  - alert: a ball is coming
  - panic: the stack under it wobbles
  - tumble: flailing while airborne
  - cheer / sad: on the result screen
- [x] Level schema: optional `characters: [{ kind, pos, role }]`, where role is `friend` (must stay on the platform), `rival` (points for knocking it off) or `decor`
- [x] Protect-friends rule in `src/rules.ts` (`friendLost`, rivals worth `RIVAL_POINTS` = 150), with Vitest tests
- [x] Voices: short, soft formant blips, rate-limited, with their own on/off button (a volume slider comes with stage E's volume settings)
- [x] Character kinds are data (like `BLOCKS` in `src/blocks.ts`), and the state machine can take new states, leaving room for D2
- [x] At most 6 characters per level; placed in levels 3, 5, 7, 10, 15, 19, 22, 25 and 26

### D2. Later: full character behaviours (big scope)

Characters that act on their own, like the original's 31, with original designs:
- walk along the structure
- lay blocks (for example a hen laying bomb blocks)
- throw things at rivals
- carry or collect blocks
- attack or chase other characters

Needs a behaviour scheduler, simple path-finding on block tops, per-kind action hooks fed by the collision event queue, schema fields for behaviour parameters, and levels built around them (rescue and defend stories). Start only after D ships.

### E. Music and sound

- [x] Richer synthesis (`src/synth.ts`), still sample-free: FM marimba and bells, Karplus-Strong plucks (banjo, lute, ukulele), synthesised drums (log drum, kick, shaker), a soft reverb send
- [x] One track per world (see the table under C); 32-bar loops with A/B sections so they wear less. The editor track waits for the editor (Phase 3)
- [x] Adaptive music: a percussion layer comes in during chains; music ducks under explosions, stingers and track changes
- [x] Win, lose and gold-medal stingers (`playStinger` in `src/audio.ts`)
- [x] SFX in `src/audio.ts`: Karplus-Strong wood clacks, layered booms (sub plus crackle), gem chimes, coin pings for point blocks, whoosh by throw tier
- [x] Separate volume for music, effects and voices (🎚 panel), a soft master limiter, and a quiet ambient bed per world (birds, waves, wind, a bell, crickets and an owl)

### F. Name, logo, UI and launch page

**Name shortlist** (working names; each still needs a check for existing games, trademarks and a free `.com` / `.io` before the user picks)

| Candidate    | Why                                   |
| ------------ | ------------------------------------- |
| Toppletown   | says what you do; friendly place name |
| Clatterbox   | the sound of falling blocks           |
| Tumble Isle  | fits the floating-island look         |
| Wobblewood   | wooden toys, wobbly towers            |
| Teeter Tower | Jenga feel                            |
| Bonk Island  | short and silly                       |
| Stackabout   | stacking plus knockabout              |
| Crumble Cove | destruction plus a world name         |
- [x] Shortlist checked; the user picks a name: **Tumble Isle** (2026-10-24; `.com` and `.io` unregistered at the time; still needs a trademark search before launch)
- [x] Logo: SVG wordmark whose letters are stacked toy blocks, one tipping over; PWA icons regenerated (`pnpm brand`, letters in `src/glyphs.ts`)
- [x] Font: chunky rounded open-licensed font (Fredoka or Baloo 2, OFL), self-hosted so it works offline
- [x] Title screen: a live 3D scene where you can knock over the logo blocks (`src/title.ts`)
- [x] World map with level islands instead of the card grid — done in stage C
- [x] Throws shown as ball icons; animated medal drop on the result screen
- [x] Debug HUD and lil-gui only in development (`import.meta.env.DEV`)
- [x] Launch page as a second Vite page (`about.html`): hero clip captured with Playwright (`pnpm hero`), feature list, Play button, credits, and "Inspired by Boom Blox (EA, 2008). Not affiliated."

### G. Arena and crowd (from reference footage)

Notes from an original gameplay frame (2026-10-24): the play area sits in an arena of giant pastel blocks like stadium seating, on a lush field; many characters stand on the blocks and on the grass around it, watching, waving and dancing.
- [x] Arena: two tiers of giant bevelled pastel blocks ringing the back and sides, open toward the camera, tinted per world (`arena` in `src/themes.ts`, built in `src/props.ts`, one draw call); big props stand on top of the back tier
- [x] Crowd: spectators of each world's species plus guests (new fox and owl) on the arena tops and the grass beside the pedestal; visual only, no physics; 6 / 10 / 16 by quality
- [x] Arms (wings for hen, parrot, owl and bat) on every character, with new moves: wave, dance, arm-pumping cheer, flailing panic
- [x] Crowd reactions: cheers on chains, scores and knocked-off rivals; dances on a win, droops on a loss; watches the ball in flight; a crowd "yay" with claps or an "aww"
- [x] Props and spectators keep clear of wide pedestals (the title scene)
- [x] Arena varies per level (seeded by level id): two or three tiers, uneven sizes, jittered placement, stacked blocks, frequent gaps, a varying opening
- [x] Arena themed per world: grass lids in Meadow, bamboo poles and rails in Tiki, battlements in Castle, rock strata in Gulch, iron spikes and candles in Manor
- [x] Crowd wears the world's costume: straw hats (Meadow), flower leis (Tiki), crowns and tabards (Castle), cowboy hats and bandanas (Gulch), witch hats and capes (Manor); level characters too
- [x] Castle arena is masonry: stone-toned blocks with a brick texture mapped by world position, so bricks keep one size on every block
- [x] Touchpad: two-finger swipe orbits and tilts, pinch zooms; a mouse wheel still zooms
- [x] Start-of-level banner (`src/brief.ts`): goal, how to play, budget and warnings (friends, rivals, tricky blocks); fades after 5 s or on the first action; not shown on retries
- [x] Spectators are hittable: arena blocks are solid, spectators are light physics bodies; a ball or laser bonks one ("Bonk!" and an "ouch"), and it poofs back to its perch after it settles. They never hold up scoring
- [x] Crowd: random species (about half natives, half anyone), bigger (2.3× on the stands), several dance styles (sway, arm pump, twirl) all locked to the music's beat (`musicBeat()` in `src/music.ts`; 120 bpm when the music is off)

## Performance budget

- 60 fps on a mid-range phone at Medium quality
- At most 2 draw calls per block type; props merged per theme into one draw call
- Pooled particles; at most 6 characters per level
- Low quality turns off the rim light, extra particles and prop shadows

## Order and gates

A → B → F (name, logo, title screen) → C → D → E, with D2 later.

Gate for each stage:
- [x] `scripts/shots.mjs` (Playwright via `playwright-core` and the system Chromium) saves one screenshot per theme; compare before and after
- [ ] Played on desktop and on a phone, at Medium and Low quality

## Open questions

- [ ] Should characters ever be the goal of whole levels (rescue stories), or stay an extra?
- [x] Should music change per level or only per world? Revisited 2026-10-24: each level now applies a subtle key/tempo variant (`setTrack` in `src/music.ts`) on top of its world's track, so levels in the same world no longer sound identical.
- [ ] Is the launch page part of this site or a separate repo?

## Sources

- [Boom Blox — Wikipedia](https://en.wikipedia.org/wiki/Boom_Blox)
- [Boom Blox review — Pocket Gamer](https://www.pocketgamer.com/steven-spielbergs-boom-blox/review/)
- [Boom Blox review — Cubed3](https://www.cubed3.com/games/reviews/wii/boom-blox)
- [Boom Blox preview — Everyeye (Italian)](https://www.everyeye.it/articoli/anteprima-boom-blox-7563.html)
- [Boom Blox review — Nintendo World Report](https://www.nintendoworldreport.com/review/15982/boom-blox-wii)
- [Bang for the Blocks: soundtrack review — Original Sound Version](http://www.originalsoundversion.com/bang-for-the-blocks-boom-blox-soundtrack-review/)
- [Boom Blox — Time Extension](https://www.timeextension.com/games/wii/boom_blox)
