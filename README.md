# Tankar Battle

A one-file Next.js 16+ retro tank game in `app/page.tsx`.

## Latest gameplay

- Slightly reduced battlefield scale: 17 × 11 grid with readable 58px cells, large walls, and large tank icons.
- Camera zoom/follow mode keeps tanks and the grid readable on desktop and mobile.
- Golden player tank, white enemy tanks, white/orange fast tanks, circular blue friendly drones, and a circular red enemy drone.
- Tank visuals were upgraded from basic blocks to vector/SVG-style icon drawing inside the canvas.
- Only 6 enemy tanks can be active at one time.
- Mission target is 20 destroyed enemy tanks.
- 4 fast enemy tanks are included in the match.
- Enemy tanks have 40 HP, so player bullets and friendly drone bullets both need repeated hits.
- 2 fast friendly drones now split targets instead of both attacking the same enemy.
- Friendly drone targeting priority: fast tanks first, normal enemy tanks next, enemy drone only after it attacks the player or friendly drones.
- The red enemy drone is slower and much tougher, with no life bar shown on top of it.
- No life bars display above tanks or drones; status remains in the HUD only.
- Slow helper tank only neutralizes enemy tank bullets; it does not attack enemies or drones.
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
