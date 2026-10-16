# Hunter's Game

A short browser puzzle game built with TypeScript, Vite, and Phaser 3. Runs on current Chrome / ChromeOS without installation or a backend. Mouse, trackpad, and touch are supported. All assets are bundled locally; no accounts, analytics, or API keys.

## Languages

The game defaults to Québec French (`fr-CA`), including on English-language devices. After the first click, choose **English** in the header to switch; **Français** switches back. The opening remains completely black. Changing languages preserves current puzzle progress and the chosen language is remembered locally, including on the credits page. If browser storage is blocked, switching still works for the current page.

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

1. **Glass:** the first screen is completely black. Click 11 times within a radius of 110 logical pixels to shatter it. Clicking elsewhere makes separate cracks. Enter or Space cracks the centre with a keyboard.
2. **HUNTER:** click letters to cycle red, orange, yellow, green, blue, indigo, violet. Six consecutive colours succeed, starting anywhere and wrapping from violet to red. Colour names are printed below the letters.
3. **VIOLA:** click to rotate 90° clockwise. All five must be upright.
4. **WHITNEY:** click through XS, SM, MD, LG, XL. All MD melts the word. Matching at any other size shakes the word and sounds an error.
5. **ELLIOTT:** E, L, L, T, T break into twelve horizontal and vertical strokes. I and O remain. Drag strokes back into the name; there are no guides. Release elsewhere and the piece stays there. Generous hidden acceptance regions and snapping accommodate gaps and overlapping strokes. Similar strokes are interchangeable. A placed stroke can be dragged again before the puzzle is completed. Once rebuilt, all seven letters crumple into paper wads and fly away in seven directions.
6. **BRIXTON:** seven clouds float in over shuffled letters. Shake the cursor back and forth over one cloud without clicking. Rain starts while shaking; the letter first appears at 2 seconds, is 50% visible at 5 seconds, and is fully visible at 10 seconds as its cloud disappears. After a brief 280 ms input tolerance, stopping reverses an unfinished reveal at one second per second. Leaving a cloud starts the same rewind immediately; completed reveals stay. Stationary hovering, tiny jitter, and a straight sweep do not count. Once all letters appear, drag them into a horizontal row spelling BRIXTON. Releasing while moving gives the letter momentum through Matter physics; stopping the cursor for at least 100 ms before release leaves it still. Letters stay within the playable area. A correct, spaced row must stay settled for 700 ms to complete.
7. **Ending:** a slow fade to white, a short pause, then a sudden visual-only zoom with the message in the selected language. Replay resets all puzzles.

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
- `src/rules.ts` holds the original puzzle checks and placement tolerance; `src/brixton-rules.ts` checks continuous shaking, reveal timing, cursor velocity, and row completion; `src/brixton.ts` runs the cloud level; `src/main.ts` runs stages and transitions; `src/audio.ts` produces simple effects with Web Audio.

Chromium automation verifies the full game, but an actual school-managed Chromebook is still useful for checking device performance, audio policies, and site-filter restrictions.
