# Pop Quiz Panic 

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

## What is in it

- Seated classroom exam: answer A/B/C, the teacher patrols, you cheat to pass (peek at neighbours, phone, crib sheet, thrown snacks).
- Modes: Training Day tutorial, Easy, Not Easy, Rush, Endless, School Week, Cheat Challenges, stickers and best scores.
- Settings gear (between rounds): sound, music, big pop-up text, high contrast, relaxed mode, calm motion, throw assist. Saved in the browser.
- Hands only: point and pinch, or poke with a finger. Controllers also work but are never required.
- No accounts, no network calls, no tracking. Only settings and progress are stored, in the browser's localStorage.

URL options for development: `?debug`, `?notitle`, `?fps`, `?bot`, `?cam=orbit|top|front|corner`.
