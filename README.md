# Pop Quiz Panic (working title)

A goofy seated VR exam-cheating game for the Meta VR Start Developer Competition 2026.
Built with the Immersive Web SDK (WebXR). Hands only, no controllers.

## Run it

Needs Node 20.19+, 22.12+ or 24+ (not 21, not 23). Check with `node -v`.

```sh
npm install
npm run dev
```

`npm run dev` opens a browser window with the Quest 3 emulator (IWER) already attached.
Debug helpers: add `?debug` to the URL for `window.__game`, and `?debug&view=top` for an overhead camera (flat browser view only).

`npm run typecheck` checks types, `npm run build` makes the `dist` folder for hosting.

## Build pieces

1. [x] Project runs, classroom + desk + exam paper
2. [x] Answering: exam sheet, A/B/C buttons (ray pinch or finger poke), timer, pass/fail
3. [x] Teacher patrol, pauses to glare at you, visible vision cone (yellow = calm, orange = you are in it)
4. [x] Catching, angry rush, 3 warnings (temporary CHEAT test button on the desk until real cheats land)
5. [x] Neighbor peek (head turn) (peek: look at a neighbor, press PEEK, HIDE dodges while she rushes)
6. [x] Phone (tap to raise, glow = evidence + longer teacher sight, ASK buffers 2-4 s, 20 s cooldown, confiscated on warning)
7. [x] Thrown fruit (random fruit, 2 far-corner zones, she walks over and stares; 4 per round) + smoke trail, popups, fidgeting kids
8. [x] Grab-and-throw fruit + sounds (fake email dropped)
9. [x] Easy / Not Easy modes (second teacher)
10. [ ] Polish: tutorial, letter grade, remove debug button
11. [ ] Submit prep
