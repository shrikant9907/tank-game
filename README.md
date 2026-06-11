# Tankar Battle

A one-file Next.js 16+ retro tank game in `app/page.tsx`.

## Latest gameplay

- Wider grid and open map so the tank can pass smoothly without destroying bricks for basic movement.
- Grass is passable and can hide the player.
- Water blocks tanks but drones can fly over everything.
- 2 friendly super-fast drones protect the player by neutralizing enemy bullets only.
- 1 big enemy drone fights the friendly drones and delays protection.
- Drones cannot be killed during normal gameplay.
- After 50 enemy tanks are destroyed, a missile destroys the enemy drone.
- Boss appears only after the missile event.
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
