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
`npm run typecheck` checks types, `npm run build` makes the `dist` folder for hosting.

## Build pieces

1. [x] Project runs, classroom + desk + exam paper
2. [ ] Answering with point and pinch
3. [ ] Teacher patrol and vision cone
4. [ ] Catching, angry rush, 3 warnings
5. [ ] Neighbor peek (head turn)
6. [ ] Phone
7. [ ] Thrown fruit
8. [ ] Fake email
9. [ ] Easy / Not Easy modes
10. [ ] Polish: art, sound, tutorial, grade
11. [ ] Submit prep
