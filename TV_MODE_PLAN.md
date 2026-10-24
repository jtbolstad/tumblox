# TV mode: play entirely from phones, no keyboard/mouse

Goal: on a smart TV (or any screen with no keyboard/mouse attached), the title screen offers
nothing but a QR code; everything else — connecting, choosing player count, picking a level,
starting — happens on the connecting phone(s).

## What already works today (no change needed)

Turns out most of this exists already, because `handleRemote` lets a phone's `cmd`/`select`
messages through regardless of phase, turn, or intro state:

- A connected phone's **Levels** button already calls `openMenu()` on the big screen —
  reaching the level picker needs no click on the TV side at all.
- The phone has its own level list (`openPicker()` in `controller.ts`) and sends `select` —
  so picking a level from the phone already works.
- `retry`/`next`/`menu`/`title` phone buttons already work from any phase.
- The per-player turn banner (just shipped) already makes a shared/passed-around phone clear.

## Real gaps

1. **`remoteCommand`'s `select` branch always calls `startSolo`** (`src/main.ts`), even when
   several phones are connected. A phone picking a level never starts a hot-seat party today —
   this is a gap independent of TV mode, just never exercised because the on-screen menu's
   player-count chips are the only current way into party mode.
2. **Opening the QR panel needs a mouse/touch tap** on the 📱 button. On a TV with no pointer,
   nothing ever shows the QR code.
3. No TV detection, so there's no signal to change the above.

## Plan

- [x] 1. **`src/device.ts` (new)** — `detectTv()`: UA match against known smart-TV browsers
      (`Tizen`, `Web0S`/`WebOS`, `SmartTV`, `GoogleTV`, `AFT[A-Z]?` (Fire TV/Silk), `BRAVIA`,
      `HbbTV`, `VIDAA`, `CrKey`). Persisted override in `localStorage` (`blox.tv.v1`) plus a
      `?tv=1` / `?tv=0` query-param escape hatch, same pattern as `readQuality()` in `main.ts`.
      Export `isTv: boolean`, computed once at module load like `lang`/`quality`.
- [x] 2. **Auto-open the remote panel on TV.** In `main.ts`, where `remoteBtn`'s click handler
      opens the panel and starts `startRemoteHost(...)`, factor that into a named function and
      call it once at boot when `isTv` is true — no tap needed, the QR is on screen from the
      title scene onward.
- [x] 3. **Fix `remoteCommand`'s `select` to respect connected phone count.** Count phones
      currently connected (`remoteConnected.filter(Boolean).length`); if it's more than 1 and
      `partyModeFor(level)` allows it, call `startParty(index, count)`, else `startSolo(index)`.
      This is the one behavior fix that isn't TV-specific — worth doing regardless, and it's
      what makes "connect phones → pick a level → it's a party" work without ever touching the
      player-count chips.
- [ ] 4. **TV-sized QR / framing polish.** On the title screen when `isTv`, show the QR bigger
      and the "scan to play" hint more prominently than the small 📱 panel is styled for today
      (that panel was designed for a quick glance next to a mouse-driven desktop UI). Cosmetic
      only — reuse `drawRemoteQr`, just a different-sized panel/placement gated on `isTv`.
- [ ] 5. **Manual test on an actual TV browser** (or Chrome with a spoofed TV user-agent) —
      confirm the panel opens with no input device at all, phones can connect, pick a level,
      and that a multi-phone connect actually starts a party per step 3.

## Explicitly out of scope for v1

- No new "pick exactly N players" step before connecting — player count is just how many
  phones are connected when a level is picked (step 3). Adding an explicit cap/selector step
  is easy to bolt on later if connected-count-as-player-count turns out to be the wrong default,
  but it's not needed to make the flow work end to end.
- No change to keyboard/mouse play — they keep working exactly as now; `isTv` only changes
  what's shown/auto-opened, never what input the game itself accepts.

## Risk

UA sniffing is a heuristic — it will miss some TVs and could (rarely) false-positive a docked
tablet. The `?tv=`/`localStorage` override exists specifically so a misdetection is a one-tap
fix, not a dead end.
