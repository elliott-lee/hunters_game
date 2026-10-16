# Hunter's Game

A short browser puzzle game built with TypeScript, Vite, and Phaser 3. Runs on current Chrome / ChromeOS without installation or a backend. Mouse, trackpad, and touch are supported. All assets are bundled locally; no accounts, analytics, or API keys.

## Languages

The game defaults to Québec French (`fr-CA`), including on English-language devices. Choose **English** on the difficulty screen or in the game header to switch; **Français** switches back. The opening uses a black background with Easy, Medium, Hard, and Impossible choices. Changing languages preserves current puzzle progress and the chosen language is remembered locally, including on the credits page. If browser storage is blocked, switching still works for the current page.

Instructions, controls, colour and size labels, keyboard/screen-reader text, credits, and the ending are translated. Names stay HUNTER, VIOLA, WHITNEY, ELLIOTT, and BRIXTON. French sizes are TP, P, M, G, TG; English sizes are XS, SM, MD, LG, XL. The ending reads “AU TRAVAIL, LES JEUNES !” in French and “GET BACK TO WORK, KIDS!” in English, with the same effects.

Translations live in `src/locales/fr-CA.ts` and `src/locales/en.ts`. Add the same keys and interpolation variables to both files; the TypeScript build and translation tests check them. `src/i18n.ts` uses i18next for language switching, interpolation, and plurals. Both catalogs ship with the site; no translation service, subscription, API key, or runtime download is needed.

i18next was selected after comparing its official documentation with [Lingui](https://github.com/lingui/js-lingui) and [FormatJS](https://github.com/formatjs/formatjs). Its framework-independent API suits the mix of Phaser canvas text and HTML controls, without introducing a message-extraction build pipeline. See the [i18next documentation](https://www.i18next.com/).

## Develop

Use Node 24 and npm:

```sh
npm ci
npm run dev
```

Open the address Vite prints. In a restricted cloud workspace, use `npm --cache /tmp/hunters-npm-cache ci` if the default npm cache is not writable. Use the existing checkout; cloud tasks already have isolated environments and don't need another Git worktree.

```sh
npm test              # Puzzle-rule and translation tests
npm run test:browser  # Chromium interaction tests
npm run build        # TypeScript checks and production bundle
npm run preview      # Serve the production build locally
```

Browser tests use `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` to your Chromium executable on another machine. Tests drive actual pointer/touch/keyboard input; the development-only `window.__game` property exposes read-only snapshots, without shortcuts to solve puzzles. It is removed from production builds.

## Play

Choose Easy, Medium, or Hard before the first crack. Impossible dodges whenever the cursor gets within 80 screen pixels; it is disabled so pointer, touch, and keyboard input cannot select it. Restart and replay return to the difficulty screen. Language changes preserve the chosen mode and puzzle state.

| Level | Easy | Medium | Hard |
| --- | --- | --- | --- |
| Glass | 3 clicks anywhere | 7 clicks anywhere | 10 clicks within the existing 110-pixel radius; no instructions |
| HUNTER | Existing colour cycle and hints | Headline removed; colour cycle and detail remain | Random initial colours and a random different colour on every click; hints and colour labels hidden |
| VIOLA | Existing quarter-turn puzzle | Headline, detail, and TURN/UPRIGHT labels hidden | Unfinished letters turn randomly among 90°, 180°, and 270°; upright letters stay still; no hints |
| WHITNEY | Existing size puzzle and labels | Headline, detail, and size labels hidden | No hints or size labels |
| ELLIOTT | Existing reconstruction and generous snapping | No instructions | Irregular random floor positions, no instructions, and tighter snapping (24×20 pixels instead of 43×35) |
| BRIXTON | 5 seconds per cloud; unfinished progress pauses | 7 seconds per cloud; 1 second unwinds every 2 seconds; elapsed time only | Original 10-second reveal and 1:1 rewind; all text hints, timers, and row guides hidden |

HUNTER still accepts any consecutive six-colour rainbow, including wraparound. VIOLA succeeds when all five letters are upright. WHITNEY succeeds only with all seven letters medium; matching at other sizes gives an error. ELLIOTT has twelve interchangeable strokes plus fixed I/O; once rebuilt, all seven letters crumple into paper wads and scatter.

BRIXTON requires meaningful back-and-forth movement over a cloud without clicking, with 280 ms between direction changes allowed for trackpads. Hovering, tiny jitter, and straight sweeps do not count. Reveal opacity scales with the mode's duration: a first glimpse at 20%, half-visible at 50%, fully visible at 100%. Fully revealed letters stay revealed. Then drag them into a horizontal row spelling BRIXTON anywhere on the visible page. Any spacing is accepted, including tight, wide, and uneven gaps; the row guides are optional. Letter positions are constrained only to keep the glyphs on screen. Matter physics uses the recent cursor velocity when releasing; stopping for at least 100 ms before release keeps a letter still. The row must settle for 700 ms. A white fade leads to the visual-only localized GET BACK TO WORK, KIDS! ending.

Sound starts with the first interaction and can be muted. **Reduce effects** suppresses shaking, decreases particles and transition motion, removes cloud bobbing, and replaces the final startle with a slow text fade with no jump-scare audio in either mode. It respects the system's initial reduced-motion preference and remembers the player's setting locally. Progress is not saved; reloading starts a fresh game. Hidden tabs, lost focus, and an open restart dialog cannot earn reveal progress.

For keyboard letter controls, Tab beyond the header controls. The focused puzzle controls become visible. Select a stroke button to control it with the arrow keys (Shift for finer movement); Enter places it. In BRIXTON, select a cloud button and alternate Left and Right quickly to shake it. Once all letters appear, select a letter button, move it with the arrows (Shift for finer movement), and press Enter to release it. Restart asks before resetting progress. Credits opens separately.

## Deploy on Netlify

Connect this repository to a Netlify site. The included `netlify.toml` selects Node 24, runs `npm run build`, and publishes `dist/`. A static site needs no environment variables or server. Netlify's free plan is suitable for this small game, subject to its current limits. Alternatively, build locally and upload `dist/` using Netlify's manual deployment.

Render can host it as a Static Site with the same build command and publish directory. Actual deployment requires access to the selected hosting account; this repository does not deploy itself.

## Resources and architecture

- Phaser 3 provides scenes, input, graphics, tweens, and Matter physics. The Canvas renderer avoids dependence on WebGL support in managed Chromebooks.
- The new cloud level reuses [Phaser's bundled Matter physics](https://docs.phaser.io/phaser/concepts/physics/matter) for letter momentum, friction, and sleeping; it needs no extra runtime libraries or remote assets.
- d3-delaunay creates the glass fragments; Matter animates their fall.
- OpenMoji provides the locally bundled unicorn and rainbow SVGs, under CC BY-SA 4.0. See `credits.html` and the bundled license. No artwork changes were made.
- i18next handles the two bundled language catalogs. `vite.config.ts` builds both the game and the localized credits page, keeping Phaser out of the credits-page bundle.
- `src/difficulty.ts` declares mode rules and hint visibility; `src/difficulty-menu.ts` handles the opening choices and evasive Impossible word; `src/rules.ts` holds the original puzzle checks and placement tolerance; `src/brixton-rules.ts` checks continuous shaking, reveal timing, cursor velocity, and row completion; `src/brixton.ts` runs the cloud level; `src/main.ts` runs stages and transitions; `src/audio.ts` produces simple effects with Web Audio.

Chromium automation verifies the full game, but an actual school-managed Chromebook is still useful for checking device performance, audio policies, and site-filter restrictions.
