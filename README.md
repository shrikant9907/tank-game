# Tankar Battle

A one-file Next.js 16+ retro tank game in `app/page.tsx`.

## Latest gameplay

- Larger battlefield: 21 × 13 grid with 52px cells for more usable movement space.
- Tank sizes are reduced slightly so the grid, walls, bullets, and units remain readable on desktop and mobile.
- Camera zoom/follow mode keeps the battlefield readable across devices.
- Golden player tank, white enemy tanks, white/orange fast tanks, 1 circular blue friendly drone, 1 circular red enemy drone, and only 1 red tank: the always-active boss tank.
- The red boss tank has the highest tank HP: 160 HP. It shows a life bar, respawns after being destroyed, and can also fire at friendly drones.
- Tank visuals use vector/SVG-style canvas drawing instead of basic blocks.
- 4 regular enemy tanks stay active while the 20-kill limit has remaining tanks to spawn.
- 4 fast enemy tanks are included across the match, with up to 2 fast tanks active at once.
- Enemy tanks have 40 HP, target the player only when the player comes near, and need repeated hits from player/helper/drone bullets.
- Player tank auto-fires continuously; the user only controls movement and positioning.
- Only 1 fast friendly drone is active in the match.
- The friendly drone fires multi-target volleys, but only against nearby targets within its attack range.
- Friendly drone targeting priority: fast tanks first, normal enemy tanks next, boss tank after nearby regular threats, enemy drone only after it attacks the player or friendly drone.
- The red enemy drone is slower and much tougher.
- Life bars display above tanks for quick battlefield reading.
- Helper tank is now a close bodyguard: it stays around the player, neutralizes nearby enemy bullets, targets fast tanks first, can attack the boss tank, and only chases enemies within useful support distance.
- Desktop, mobile, Android TV remote, and gamepad controls are supported.

## Simpler gameplay direction

The battlefield now uses a clearer structure: one player, one close helper, one friendly drone, one enemy drone, one red boss tank, and four active white enemy tanks. Enemy tanks only become dangerous when the player approaches, while the helper and drone reduce pressure without making the screen feel crowded.

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
