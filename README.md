# Tankar Battle

A one-file Next.js 16+ retro tank game in `app/page.tsx`.

## Latest gameplay

- Larger battlefield: 21 × 13 grid with 52px cells for more grid space.
- Tank sizes were reduced slightly so movement and targeting feel clearer on desktop and mobile.
- Camera zoom/follow mode keeps the battlefield readable across devices.
- Golden player tank, white enemy tanks, white/orange fast tanks, 1 circular blue friendly drone, 1 circular red enemy drone, and an always-active red boss tank.
- The red boss tank has the highest tank HP: 160 HP. It shows a life bar, respawns after being destroyed, and can also fire at friendly drones.
- Tank visuals use vector/SVG-style canvas drawing instead of basic blocks.
- Only 1 regular enemy tank can be active at one time.
- Mission target is 20 destroyed regular enemy tanks, spawned one at a time.
- 4 fast enemy tanks are included in the match, but only one regular enemy tank is active at any moment.
- Enemy tanks have 40 HP, target the player only when the player comes near, and need repeated hits from player/helper/drone bullets.
- Only 1 fast friendly drone is active in the match.
- The friendly drone fires multi-target volleys, but only against nearby targets within its attack range.
- Friendly drone targeting priority: fast tanks first, normal enemy tanks next, boss tank after regular nearby threats, enemy drone only after it attacks the player or friendly drone.
- The red enemy drone is slower and much tougher.
- Life bars display above tanks for quick battlefield reading.
- Fast helper tank assists in combat, targets fast tanks first, and still neutralizes enemy tank bullets.
- Desktop, mobile, Android TV remote, and gamepad controls are supported.

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


## Latest rule update

- Player tank auto-fires continuously.
- Manual fire button/keyboard shooting is removed from the main controls.
- User only controls tank movement and positioning.
- Only 1 regular enemy tank is active at a time.
- Regular enemy tank targets/fires only when the player comes near it.
- Boss tank can also target and fire at the friendly drone.
