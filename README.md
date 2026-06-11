# Tankar Battle

A one-file Next.js retro tank game in `app/page.tsx`.

## Latest gameplay

- Battlefield: 21 × 13 grid with 52px cells.
- Tanks are smaller and cleaner for better readability.
- The battlefield now uses the full available gameplay area on desktop so tanks stay readable without boxing the action into a small square.
- Golden player tank, white enemy tanks, orange-accent fast tanks, 1 circular blue friendly drone, 1 red boss tank, and 1 helper tank.
- The red boss tank has the highest HP: 160 HP.
- The boss tank does **not** return again after it is destroyed in the same game.
- Tank visuals use vector/SVG-style canvas drawing.
- Map balance updated with more grass, more brick cover, and fewer metal/stone blocks.
- Comfort-view palette added: softer background, muted grass/bricks, less bright bullets, lower grid contrast, reduced flashes, and reduced screen shake.
- 4 regular enemy tanks stay active while the 20-kill limit still has tanks left to spawn.
- 4 fast enemy tanks are included across the match, with up to 2 fast tanks active at once.
- Enemy tanks have 40 HP and only target the player when the player comes near.
- Player tank auto-fires continuously; the user only controls movement.
- 1 friendly drone is active in the match.
- The friendly drone is defensive only: it follows the player and neutralizes incoming enemy bullets instead of attacking tanks.
- Life bars display above tanks for quick battlefield reading.
- Helper tank stays near the player, blocks nearby enemy bullets, and attacks useful targets with priority on fast tanks first and the red boss tank after that.
- Desktop, mobile, Android TV remote, and gamepad controls are supported.

## Simpler gameplay direction

The gameplay is simplified around a cleaner structure: one player, one helper, one friendly drone, one red boss tank, and four active white enemy tanks. The screen is less crowded and the square play view is easier to track.

## Run locally

```bash
npm install
npm run dev
```

## Deploy on GitHub Pages

The workflow is included at:

```text
.github/workflows/nextjs.yml
```

GitHub Pages URL:

```text
https://shrikant9907.github.io/tank-game/
```

Enable this once:

```text
Repo Settings → Pages → Source → GitHub Actions
```


## Final upgrade pass

- Friend drone is defensive only and now prioritizes incoming bullets near the player.
- HUD is cleaner with fewer status boxes.
- Tank sizes were slightly improved for readability while keeping the comfort-view palette.
- Helper tank stays closer to the player and avoids chasing too far.
- Desktop play area uses available screen space without boxing the battlefield into a small square.
- Visual effects are calmer: reduced shake, softer bullets, softer explosions, and lower grid contrast.


- Brick walls updated to match the red brick + white mortar reference more closely.

## If the game does not start

1. Delete old `.next`, `out`, and `node_modules` folders.
2. Run `npm install`.
3. Run `npm run dev` for local testing.
4. Run `npm run build` before deployment.
5. Hard refresh the browser after deployment because GitHub Pages/browser cache may keep old JS files.


## Runtime color fix

- Fixed invalid canvas color values that could stop the game loop.
- Grass rendering upgraded with dense blade-like texture.
- Water rendering upgraded with soft ripple lines.


## Latest rule update

- 4 regular enemy tanks stay active at a time.
- Regular enemy tanks die with 1 bullet.
- Player must destroy 50 regular tanks first.
- Boss tank appears only after the 50 regular tanks are destroyed.
- Friend drone remains defensive and can neutralize incoming enemy bullets.
- Boss shots are lethal: one shot can destroy the helper tank, destroy the friend drone, or end the player game.


## 1366 viewport tuning

- Desktop game area tuned for 1366×768 screens.
- Canvas uses the safe space between the top HUD and bottom help footer.
- Enemy tanks are slightly faster.
- Player auto-fire cooldown is reduced in intensity so bullets are not too frequent.
- Helper tank has return/recovery logic so it stays near the player and can unstuck itself.


## Final combat fixes

- Enemy tank speed increased again.
- Enemy tanks now actively move into a firing lane and shoot when aligned with the player.
- Enemy tanks no longer feel idle from distance.
- Helper tank no longer fires diagonal/random-looking shots.
- Helper tank now fires like a real tank: straight cannon bullets from the barrel only when aligned with a clear line.
- Helper still returns near the player and has unstuck recovery.


## Square arcade layout update

- Desktop layout now uses a square battlefield based on available screen height.
- Main game information moved to left and right side panels instead of top and bottom bars.
- Arena layout updated in a more classic arcade / Battle City direction.
- Enemy tanks no longer wander as much; they actively seek the player and become aggressive when they enter the same row or column.
