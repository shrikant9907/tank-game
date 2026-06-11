"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type Dir = "up" | "down" | "left" | "right";
type WallKind = "brick" | "stone" | "metal";
type TerrainKind = "grass" | "water";
type Status = "idle" | "playing" | "paused" | "victory" | "gameover";
type Owner = "player" | "enemy" | "assistant";

type Rect = { x: number; y: number; w: number; h: number };

type Wall = Rect & {
  id: number;
  kind: WallKind;
  hp: number;
  maxHp: number;
};

type Terrain = Rect & {
  id: number;
  kind: TerrainKind;
};

type Tank = Rect & {
  id: string;
  kind: "player" | "enemy" | "boss" | "assistant";
  dir: Dir;
  speed: number;
  cooldown: number;
  aiTimer: number;
};

type Bullet = Rect & {
  id: string;
  owner: Owner;
  sourceId: string;
  dir: Dir;
  speed: number;
  dead?: boolean;
};

type Explosion = {
  id: string;
  x: number;
  y: number;
  t: number;
  life: number;
  size: number;
};

type PowerUp = Rect & {
  id: string;
  kind: "speed";
  life: number;
};

type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
};

type Game = {
  status: Status;
  walls: Wall[];
  terrain: Terrain[];
  player: Tank;
  assistant: Tank | null;
  assistantRespawn: number;
  enemies: Tank[];
  boss: Tank | null;
  bullets: Bullet[];
  explosions: Explosion[];
  powerUps: PowerUp[];
  lives: number;
  playerHp: number;
  kills: number;
  normalSpawned: number;
  bossHp: number;
  bossSpawned: boolean;
  playerInvincible: number;
  seed: number;
  time: number;
  shake: number;
  muted: boolean;
  message: string;
  messageTimer: number;
  nextPowerMilestone: number;
  speedBoostTimer: number;
};

const CELL = 32;
const COLS = 31;
const ROWS = 23;
const WORLD_W = COLS * CELL;
const WORLD_H = ROWS * CELL;

const PLAYER_SIZE = 34;
const ENEMY_SIZE = 34;
const ASSISTANT_SIZE = 32;
const BOSS_SIZE = 76;

const TARGET_KILLS = 50;
const ACTIVE_ENEMIES = 10;
const PLAYER_LIVES = 3;
const PLAYER_HP_PER_LIFE = 10;
const BOSS_MAX_HP = 20;

const PLAYER_BASE_SPEED = 270;
const PLAYER_BOOST_SPEED = 355;
const ENEMY_SPEED = 50;
const ASSISTANT_SPEED = 365;
const BOSS_SPEED = 135;

const EMPTY_INPUT: InputState = { up: false, down: false, left: false, right: false, fire: false };
const DIRS: Dir[] = ["up", "right", "down", "left"];

const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  " ": ["000", "000", "000", "000", "000", "000", "000"],
};

function copyInput(input: InputState): InputState {
  return { up: input.up, down: input.down, left: input.left, right: input.right, fire: input.fire };
}

function mergeInputs(a: InputState, b: InputState, c: InputState): InputState {
  return {
    up: a.up || b.up || c.up,
    down: a.down || b.down || c.down,
    left: a.left || b.left || c.left,
    right: a.right || b.right || c.right,
    fire: a.fire || b.fire || c.fire,
  };
}

function dirVector(dir: Dir) {
  if (dir === "up") return { dx: 0, dy: -1 };
  if (dir === "down") return { dx: 0, dy: 1 };
  if (dir === "left") return { dx: -1, dy: 0 };
  return { dx: 1, dy: 0 };
}

function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function centerOf(r: Rect) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function distance(a: Rect, b: Rect) {
  const ac = centerOf(a);
  const bc = centerOf(b);
  return Math.hypot(ac.x - bc.x, ac.y - bc.y);
}

function rand(game: Game) {
  game.seed = (game.seed * 1664525 + 1013904223) >>> 0;
  return game.seed / 4294967296;
}

function addExplosion(game: Game, x: number, y: number, size = 26) {
  game.explosions.push({ id: `ex-${performance.now()}-${Math.random()}`, x, y, t: 0, life: 0.35, size });
}

class ArcadeAudio {
  ctx: AudioContext | null = null;
  muted = false;

  ensure() {
    if (!this.ctx && typeof window !== "undefined") {
      const WebAudio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (WebAudio) this.ctx = new WebAudio();
    }
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  play(type: "shoot" | "hit" | "boom" | "life" | "boss" | "win" | "lose" | "start" | "power" | "spark") {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    let freq = 220;
    let duration = 0.12;
    let wave: OscillatorType = "square";

    if (type === "shoot") { freq = 480; duration = 0.045; }
    if (type === "hit") { freq = 135; duration = 0.08; wave = "sawtooth"; }
    if (type === "spark") { freq = 900; duration = 0.055; wave = "square"; }
    if (type === "boom") { freq = 70; duration = 0.24; wave = "sawtooth"; }
    if (type === "life") { freq = 95; duration = 0.34; wave = "triangle"; }
    if (type === "boss") { freq = 55; duration = 0.55; wave = "sawtooth"; }
    if (type === "win") { freq = 700; duration = 0.45; }
    if (type === "lose") { freq = 82; duration = 0.55; wave = "sawtooth"; }
    if (type === "start") { freq = 320; duration = 0.18; }
    if (type === "power") { freq = 780; duration = 0.22; wave = "triangle"; }

    osc.type = wave;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(35, freq * 0.48), ctx.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }
}

function wallHp(kind: WallKind) {
  if (kind === "brick") return 1;
  if (kind === "stone") return 8;
  return 9999;
}

function buildTerrain(): Terrain[] {
  const terrain: Terrain[] = [];
  let id = 1;
  const rect = (gx: number, gy: number, gw: number, gh: number, kind: TerrainKind) => {
    terrain.push({ id: id++, kind, x: gx * CELL, y: gy * CELL, w: gw * CELL, h: gh * CELL });
  };

  rect(4, 3, 4, 2, "grass");
  rect(23, 3, 4, 2, "grass");
  rect(4, 17, 4, 3, "grass");
  rect(23, 17, 4, 3, "grass");
  rect(13, 10, 5, 3, "grass");
  rect(10, 6, 2, 4, "water");
  rect(19, 6, 2, 4, "water");
  rect(10, 16, 2, 3, "water");
  rect(19, 16, 2, 3, "water");
  rect(14, 3, 3, 1, "water");
  rect(14, 20, 3, 1, "water");
  return terrain;
}

function buildWalls(): Wall[] {
  const walls: Wall[] = [];
  const used = new Set<string>();
  let id = 1;

  const add = (gx: number, gy: number, kind: WallKind) => {
    if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return;
    const key = `${gx}:${gy}`;
    if (used.has(key)) return;
    used.add(key);
    const hp = wallHp(kind);
    walls.push({ id: id++, kind, x: gx * CELL, y: gy * CELL, w: CELL, h: CELL, hp, maxHp: hp });
  };

  const rect = (gx: number, gy: number, gw: number, gh: number, kind: WallKind) => {
    for (let y = gy; y < gy + gh; y++) for (let x = gx; x < gx + gw; x++) add(x, y, kind);
  };

  rect(5, 2, 5, 1, "brick");
  rect(21, 2, 5, 1, "brick");
  rect(12, 1, 2, 2, "brick");
  rect(17, 1, 2, 2, "brick");

  rect(2, 5, 2, 6, "brick");
  rect(7, 5, 2, 6, "brick");
  rect(22, 5, 2, 6, "brick");
  rect(27, 5, 2, 6, "brick");

  rect(12, 6, 2, 5, "brick");
  rect(17, 6, 2, 5, "brick");
  rect(13, 6, 5, 1, "brick");

  rect(2, 14, 2, 6, "brick");
  rect(7, 14, 2, 6, "brick");
  rect(22, 14, 2, 6, "brick");
  rect(27, 14, 2, 6, "brick");

  rect(13, 15, 5, 1, "brick");
  rect(14, 16, 3, 1, "stone");
  rect(13, 17, 1, 2, "metal");
  rect(17, 17, 1, 2, "metal");
  rect(14, 18, 3, 1, "metal");

  rect(0, 4, 2, 1, "stone");
  rect(29, 4, 2, 1, "stone");
  rect(0, 10, 2, 1, "metal");
  rect(29, 10, 2, 1, "metal");

  rect(5, 12, 3, 1, "stone");
  rect(23, 12, 3, 1, "stone");
  rect(10, 14, 2, 2, "brick");
  rect(19, 14, 2, 2, "brick");

  rect(10, 19, 3, 1, "stone");
  rect(18, 19, 3, 1, "stone");
  rect(4, 21, 5, 1, "brick");
  rect(22, 21, 5, 1, "brick");

  const clearZones: Rect[] = [
    { x: 0, y: 0, w: CELL * 4, h: CELL * 4 },
    { x: WORLD_W - CELL * 4, y: 0, w: CELL * 4, h: CELL * 4 },
    { x: 0, y: WORLD_H - CELL * 4, w: CELL * 4, h: CELL * 4 },
    { x: WORLD_W - CELL * 4, y: WORLD_H - CELL * 4, w: CELL * 4, h: CELL * 4 },
    { x: CELL * 13, y: 0, w: CELL * 5, h: CELL * 4 },
    { x: CELL * 11, y: CELL * 9, w: CELL * 10, h: CELL * 6 },
  ];

  return walls.filter((w) => !clearZones.some((z) => rectsOverlap(w, z)));
}

function createPlayer(): Tank {
  return {
    id: "player",
    kind: "player",
    x: WORLD_W / 2 - PLAYER_SIZE / 2,
    y: WORLD_H / 2 - PLAYER_SIZE / 2,
    w: PLAYER_SIZE,
    h: PLAYER_SIZE,
    dir: "up",
    speed: PLAYER_BASE_SPEED,
    cooldown: 0,
    aiTimer: 0,
  };
}

function createAssistantNearPlayer(player: Tank): Tank {
  return {
    id: "assistant",
    kind: "assistant",
    x: player.x - 42,
    y: player.y + 38,
    w: ASSISTANT_SIZE,
    h: ASSISTANT_SIZE,
    dir: "up",
    speed: ASSISTANT_SPEED,
    cooldown: 0,
    aiTimer: 0,
  };
}

function createGame(status: Status = "idle", muted = false): Game {
  const player = createPlayer();
  return {
    status,
    walls: buildWalls(),
    terrain: buildTerrain(),
    player,
    assistant: createAssistantNearPlayer(player),
    assistantRespawn: 0,
    enemies: [],
    boss: null,
    bullets: [],
    explosions: [],
    powerUps: [],
    lives: PLAYER_LIVES,
    playerHp: PLAYER_HP_PER_LIFE,
    kills: 0,
    normalSpawned: 0,
    bossHp: 0,
    bossSpawned: false,
    playerInvincible: 0,
    seed: 987654321,
    time: 0,
    shake: 0,
    muted,
    message: "",
    messageTimer: 0,
    nextPowerMilestone: 3,
    speedBoostTimer: 0,
  };
}

function isWaterBlocked(game: Game, rect: Rect) {
  return game.terrain.some((t) => t.kind === "water" && rectsOverlap(rect, t));
}

function isInGrass(game: Game, rect: Rect) {
  return game.terrain.some((t) => t.kind === "grass" && rectsOverlap(rect, t));
}

function isTankBlocked(game: Game, tank: Tank, nx: number, ny: number) {
  const next = { x: nx, y: ny, w: tank.w, h: tank.h };
  if (next.x < 0 || next.y < 0 || next.x + next.w > WORLD_W || next.y + next.h > WORLD_H) return true;
  if (game.walls.some((w) => rectsOverlap(next, w))) return true;
  if (isWaterBlocked(game, next)) return true;
  if (tank.id !== "player" && rectsOverlap(next, game.player)) return true;
  if (tank.id !== "assistant" && game.assistant && rectsOverlap(next, game.assistant)) return true;
  for (const e of game.enemies) if (e.id !== tank.id && rectsOverlap(next, e)) return true;
  if (game.boss && game.boss.id !== tank.id && rectsOverlap(next, game.boss)) return true;
  return false;
}

function moveTank(game: Game, tank: Tank, dt: number) {
  const v = dirVector(tank.dir);
  const nx = tank.x + v.dx * tank.speed * dt;
  const ny = tank.y + v.dy * tank.speed * dt;
  if (!isTankBlocked(game, tank, nx, ny)) {
    tank.x = nx;
    tank.y = ny;
    return true;
  }
  return false;
}

function moveTankToward(game: Game, tank: Tank, tx: number, ty: number, dt: number) {
  const c = centerOf(tank);
  const dx = tx - c.x;
  const dy = ty - c.y;
  const primary: Dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
  const secondary: Dir = Math.abs(dx) > Math.abs(dy) ? (dy < 0 ? "up" : "down") : dx < 0 ? "left" : "right";
  tank.dir = primary;
  if (!moveTank(game, tank, dt)) {
    tank.dir = secondary;
    if (!moveTank(game, tank, dt)) {
      tank.dir = DIRS[Math.floor((performance.now() / 300) % DIRS.length)];
      moveTank(game, tank, dt);
    }
  }
}

function isAreaFree(game: Game, r: Rect, allowPlayer = false) {
  if (r.x < 0 || r.y < 0 || r.x + r.w > WORLD_W || r.y + r.h > WORLD_H) return false;
  if (game.walls.some((w) => rectsOverlap(r, w))) return false;
  if (isWaterBlocked(game, r)) return false;
  if (!allowPlayer && rectsOverlap(r, game.player)) return false;
  if (game.assistant && rectsOverlap(r, game.assistant)) return false;
  if (game.enemies.some((e) => rectsOverlap(r, e))) return false;
  if (game.boss && rectsOverlap(r, game.boss)) return false;
  return true;
}

function spawnNormalEnemies(game: Game) {
  const points = [
    { gx: 1, gy: 1, dir: "down" as Dir },
    { gx: 29, gy: 1, dir: "down" as Dir },
    { gx: 1, gy: 21, dir: "up" as Dir },
    { gx: 29, gy: 21, dir: "up" as Dir },
    { gx: 15, gy: 1, dir: "down" as Dir },
    { gx: 15, gy: 21, dir: "up" as Dir },
    { gx: 5, gy: 1, dir: "down" as Dir },
    { gx: 25, gy: 21, dir: "up" as Dir },
    { gx: 1, gy: 12, dir: "right" as Dir },
    { gx: 29, gy: 12, dir: "left" as Dir },
  ];

  let guard = 0;
  while (game.enemies.length < ACTIVE_ENEMIES && game.normalSpawned < TARGET_KILLS && guard < 150) {
    guard++;
    const p = points[(game.normalSpawned + guard) % points.length];
    const r = {
      x: p.gx * CELL + Math.max(0, (CELL - ENEMY_SIZE) / 2),
      y: p.gy * CELL + Math.max(0, (CELL - ENEMY_SIZE) / 2),
      w: ENEMY_SIZE,
      h: ENEMY_SIZE,
    };
    if (!isAreaFree(game, r)) continue;
    game.enemies.push({
      id: `enemy-${game.normalSpawned + 1}`,
      kind: "enemy",
      ...r,
      dir: p.dir,
      speed: ENEMY_SPEED,
      cooldown: 0.8 + rand(game) * 0.7,
      aiTimer: 0.2,
    });
    game.normalSpawned++;
  }
}

function spawnBoss(game: Game, audio?: ArcadeAudio | null) {
  if (game.bossSpawned) return;
  game.bossSpawned = true;
  game.bossHp = BOSS_MAX_HP;
  game.message = "MASTER TANK ARRIVED";
  game.messageTimer = 2;
  game.shake = 0.5;
  game.boss = {
    id: "boss",
    kind: "boss",
    x: WORLD_W / 2 - BOSS_SIZE / 2,
    y: CELL * 1 + 2,
    w: BOSS_SIZE,
    h: BOSS_SIZE,
    dir: "down",
    speed: BOSS_SPEED,
    cooldown: 0.25,
    aiTimer: 0.15,
  };
  audio?.play("boss");
}

function hasActiveSourceBullet(game: Game, tankId: string) {
  return game.bullets.some((b) => !b.dead && b.sourceId === tankId);
}

function fireBullet(game: Game, tank: Tank, owner: Owner, audio?: ArcadeAudio | null) {
  if (tank.cooldown > 0) return;
  if (owner === "enemy" && tank.kind !== "boss" && hasActiveSourceBullet(game, tank.id)) return;

  const c = centerOf(tank);
  const vertical = tank.dir === "up" || tank.dir === "down";
  const bw = vertical ? 6 : 13;
  const bh = vertical ? 13 : 6;
  let x = c.x - bw / 2;
  let y = c.y - bh / 2;
  if (tank.dir === "up") y = tank.y - bh - 2;
  if (tank.dir === "down") y = tank.y + tank.h + 2;
  if (tank.dir === "left") x = tank.x - bw - 2;
  if (tank.dir === "right") x = tank.x + tank.w + 2;

  game.bullets.push({
    id: `b-${performance.now()}-${Math.random()}`,
    owner,
    sourceId: tank.id,
    x,
    y,
    w: bw,
    h: bh,
    dir: tank.dir,
    speed: owner === "player" ? 390 : owner === "assistant" ? 470 : tank.kind === "boss" ? 315 : 230,
  });

  tank.cooldown = owner === "player" ? 0.085 : owner === "assistant" ? 0.16 : tank.kind === "boss" ? 0.36 : 1.15;
  audio?.play("shoot");
}

function playerIsHiddenFrom(game: Game, tank: Tank) {
  if (!isInGrass(game, game.player)) return false;
  return distance(tank, game.player) > 150;
}

function lineClearToPlayer(game: Game, tank: Tank) {
  const a = centerOf(tank);
  const b = centerOf(game.player);
  const sameColumn = Math.abs(a.x - b.x) < CELL * 0.45;
  const sameRow = Math.abs(a.y - b.y) < CELL * 0.45;
  if (!sameColumn && !sameRow) return false;
  if (playerIsHiddenFrom(game, tank) && distance(tank, game.player) > 230) return false;

  const ray: Rect = sameColumn
    ? { x: a.x - 4, y: Math.min(a.y, b.y), w: 8, h: Math.abs(a.y - b.y) }
    : { x: Math.min(a.x, b.x), y: a.y - 4, w: Math.abs(a.x - b.x), h: 8 };
  return !game.walls.some((w) => rectsOverlap(ray, w));
}

function aimAtPlayer(game: Game, tank: Tank) {
  const a = centerOf(tank);
  const b = centerOf(game.player);
  if (Math.abs(a.x - b.x) < CELL * 0.45) {
    tank.dir = b.y < a.y ? "up" : "down";
    return true;
  }
  if (Math.abs(a.y - b.y) < CELL * 0.45) {
    tank.dir = b.x < a.x ? "left" : "right";
    return true;
  }
  return false;
}

function spawnPowerUp(game: Game) {
  const candidates: Rect[] = [
    { x: WORLD_W / 2 - 16, y: WORLD_H / 2 - 16, w: 32, h: 32 },
    { x: CELL * 5, y: CELL * 4, w: 32, h: 32 },
    { x: CELL * 25, y: CELL * 4, w: 32, h: 32 },
    { x: CELL * 5, y: CELL * 18, w: 32, h: 32 },
    { x: CELL * 25, y: CELL * 18, w: 32, h: 32 },
    { x: CELL * 15, y: CELL * 11, w: 32, h: 32 },
  ];

  for (const c of candidates) {
    if (isAreaFree(game, c, true)) {
      game.powerUps = [{ id: `p-${performance.now()}`, kind: "speed", life: 10, ...c }];
      game.message = "SPEED POWER READY";
      game.messageTimer = 1.4;
      return;
    }
  }
}

function destroyEnemy(game: Game, enemyId: string, audio?: ArcadeAudio | null) {
  const enemy = game.enemies.find((e) => e.id === enemyId);
  if (!enemy) return;
  addExplosion(game, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 34);
  game.enemies = game.enemies.filter((e) => e.id !== enemyId);
  game.kills++;
  game.shake = 0.12;
  audio?.play("boom");

  if (!game.bossSpawned && game.kills >= game.nextPowerMilestone && game.kills < TARGET_KILLS) {
    spawnPowerUp(game);
    game.nextPowerMilestone += 3;
  }
}

function killAssistant(game: Game, audio?: ArcadeAudio | null) {
  if (!game.assistant) return;
  addExplosion(game, game.assistant.x + game.assistant.w / 2, game.assistant.y + game.assistant.h / 2, 38);
  game.assistant = null;
  game.assistantRespawn = 10;
  game.message = "ASSISTANT DOWN";
  game.messageTimer = 1.4;
  audio?.play("boom");
}

function damagePlayer(game: Game, audio?: ArcadeAudio | null) {
  if (game.playerInvincible > 0 || game.status !== "playing") return;
  game.playerHp--;
  game.playerInvincible = 0.22;
  game.shake = 0.12;
  addExplosion(game, game.player.x + game.player.w / 2, game.player.y + game.player.h / 2, 22);

  if (game.playerHp <= 0) {
    game.lives--;
    audio?.play("life");
    if (game.lives <= 0) {
      game.status = "gameover";
      game.message = "GAME OVER";
      game.messageTimer = 3;
      audio?.play("lose");
      return;
    }
    game.playerHp = PLAYER_HP_PER_LIFE;
    game.player.x = WORLD_W / 2 - PLAYER_SIZE / 2;
    game.player.y = WORLD_H / 2 - PLAYER_SIZE / 2;
    game.player.dir = "up";
    game.playerInvincible = 1.5;
    game.bullets = game.bullets.filter((b) => b.owner !== "enemy");
  } else {
    audio?.play("hit");
  }
}

function damageWall(game: Game, wallIndex: number, bulletOwner: Owner, audio?: ArcadeAudio | null) {
  const wall = game.walls[wallIndex];
  if (wall.kind === "metal") {
    addExplosion(game, wall.x + wall.w / 2, wall.y + wall.h / 2, 14);
    audio?.play("spark");
    return;
  }
  if (bulletOwner === "assistant") return;
  wall.hp -= 1;
  addExplosion(game, wall.x + wall.w / 2, wall.y + wall.h / 2, 18);
  audio?.play("hit");
  if (wall.hp <= 0) {
    game.walls.splice(wallIndex, 1);
    addExplosion(game, wall.x + wall.w / 2, wall.y + wall.h / 2, 28);
  }
}

function updateBullets(game: Game, dt: number, audio?: ArcadeAudio | null) {
  for (const bullet of game.bullets) {
    if (bullet.dead) continue;
    const v = dirVector(bullet.dir);
    const steps = Math.max(1, Math.ceil((bullet.speed * dt) / 7));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      bullet.x += v.dx * bullet.speed * stepDt;
      bullet.y += v.dy * bullet.speed * stepDt;

      if (bullet.x < -20 || bullet.y < -20 || bullet.x > WORLD_W + 20 || bullet.y > WORLD_H + 20) {
        bullet.dead = true;
        break;
      }

      const wallIndex = game.walls.findIndex((w) => rectsOverlap(bullet, w));
      if (wallIndex !== -1) {
        damageWall(game, wallIndex, bullet.owner, audio);
        bullet.dead = true;
        break;
      }

      if (bullet.owner === "enemy") {
        if (game.assistant && rectsOverlap(bullet, game.assistant)) {
          bullet.dead = true;
          killAssistant(game, audio);
          break;
        }
        if (rectsOverlap(bullet, game.player)) {
          bullet.dead = true;
          damagePlayer(game, audio);
          break;
        }
      }

      if (bullet.owner === "player") {
        const enemy = game.enemies.find((e) => rectsOverlap(bullet, e));
        if (enemy) {
          bullet.dead = true;
          destroyEnemy(game, enemy.id, audio);
          break;
        }
        if (game.boss && rectsOverlap(bullet, game.boss)) {
          bullet.dead = true;
          game.bossHp--;
          game.shake = 0.1;
          addExplosion(game, bullet.x + bullet.w / 2, bullet.y + bullet.h / 2, 18);
          audio?.play("hit");
          if (game.bossHp <= 0) {
            addExplosion(game, game.boss.x + game.boss.w / 2, game.boss.y + game.boss.h / 2, 90);
            game.boss = null;
            game.status = "victory";
            game.message = "VICTORY";
            game.messageTimer = 4;
            audio?.play("win");
          }
          break;
        }
      }
    }
  }

  for (let i = 0; i < game.bullets.length; i++) {
    const a = game.bullets[i];
    if (a.dead) continue;
    for (let j = i + 1; j < game.bullets.length; j++) {
      const b = game.bullets[j];
      if (b.dead) continue;
      const neutralizes = (a.owner === "enemy" && (b.owner === "player" || b.owner === "assistant")) ||
        (b.owner === "enemy" && (a.owner === "player" || a.owner === "assistant"));
      if (neutralizes && rectsOverlap(a, b)) {
        a.dead = true;
        b.dead = true;
        addExplosion(game, (a.x + b.x) / 2, (a.y + b.y) / 2, 16);
        audio?.play("hit");
      }
    }
  }

  if (game.assistant) {
    for (const b of game.bullets) {
      if (b.owner === "enemy" && !b.dead && rectsOverlap(game.assistant, b)) {
        b.dead = true;
        addExplosion(game, b.x + b.w / 2, b.y + b.h / 2, 18);
        audio?.play("hit");
      }
    }
  }

  game.bullets = game.bullets.filter((b) => !b.dead);
}

function updateEnemies(game: Game, dt: number, audio?: ArcadeAudio | null) {
  for (const enemy of game.enemies) {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.aiTimer -= dt;

    if (lineClearToPlayer(game, enemy) && aimAtPlayer(game, enemy)) {
      fireBullet(game, enemy, "enemy", audio);
    }

    if (enemy.aiTimer <= 0) {
      enemy.aiTimer = 0.35 + rand(game) * 0.85;
      const c = centerOf(enemy);
      const p = centerOf(game.player);
      const preferHorizontal = Math.abs(p.x - c.x) > Math.abs(p.y - c.y);
      if (rand(game) < 0.52 && !playerIsHiddenFrom(game, enemy)) {
        enemy.dir = preferHorizontal ? (p.x < c.x ? "left" : "right") : p.y < c.y ? "up" : "down";
      } else {
        enemy.dir = DIRS[Math.floor(rand(game) * DIRS.length)];
      }
    }

    const moved = moveTank(game, enemy, dt);
    if (!moved) {
      enemy.dir = DIRS[Math.floor(rand(game) * DIRS.length)];
      enemy.aiTimer = 0.15;
    }
  }
}

function updateBoss(game: Game, dt: number, audio?: ArcadeAudio | null) {
  const boss = game.boss;
  if (!boss) return;
  boss.cooldown = Math.max(0, boss.cooldown - dt);
  boss.aiTimer -= dt;
  const c = centerOf(boss);
  const p = centerOf(game.player);

  if (lineClearToPlayer(game, boss) && aimAtPlayer(game, boss)) fireBullet(game, boss, "enemy", audio);

  if (boss.aiTimer <= 0) {
    boss.aiTimer = 0.18;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    if (Math.abs(dx) > Math.abs(dy)) boss.dir = dx < 0 ? "left" : "right";
    else boss.dir = dy < 0 ? "up" : "down";
  }

  const moved = moveTank(game, boss, dt);
  if (!moved) boss.dir = Math.abs(p.x - c.x) > Math.abs(p.y - c.y) ? (p.y < c.y ? "up" : "down") : p.x < c.x ? "left" : "right";
}

function enemyBulletThreatScore(game: Game, bullet: Bullet) {
  if (bullet.owner !== "enemy") return Infinity;
  const bv = dirVector(bullet.dir);
  const bc = centerOf(bullet);
  const pc = centerOf(game.player);
  const toPlayer = { dx: pc.x - bc.x, dy: pc.y - bc.y };
  const approaching = toPlayer.dx * bv.dx + toPlayer.dy * bv.dy;
  if (approaching < -20) return Infinity;
  const lane = bullet.dir === "left" || bullet.dir === "right" ? Math.abs(pc.y - bc.y) : Math.abs(pc.x - bc.x);
  const d = Math.hypot(toPlayer.dx, toPlayer.dy);
  return lane * 2 + d * 0.45;
}

function aimAtRect(tank: Tank, target: Rect) {
  const a = centerOf(tank);
  const b = centerOf(target);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  tank.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
}

function updateAssistant(game: Game, dt: number, audio?: ArcadeAudio | null) {
  if (!game.assistant) {
    if (game.assistantRespawn > 0) game.assistantRespawn = Math.max(0, game.assistantRespawn - dt);
    if (game.assistantRespawn <= 0 && game.status === "playing") {
      const assistant = createAssistantNearPlayer(game.player);
      if (isAreaFree(game, assistant, true)) game.assistant = assistant;
      else {
        assistant.x = game.player.x + 42;
        assistant.y = game.player.y - 38;
        game.assistant = assistant;
      }
      game.message = "ASSISTANT ONLINE";
      game.messageTimer = 1.2;
    }
    return;
  }

  const assistant = game.assistant;
  assistant.cooldown = Math.max(0, assistant.cooldown - dt);

  let targetBullet: Bullet | null = null;
  let best = Infinity;
  for (const b of game.bullets) {
    const score = enemyBulletThreatScore(game, b);
    if (score < best) {
      best = score;
      targetBullet = b;
    }
  }

  if (targetBullet && best < 360) {
    const tc = centerOf(targetBullet);
    moveTankToward(game, assistant, tc.x, tc.y, dt);
    aimAtRect(assistant, targetBullet);
    if (distance(assistant, targetBullet) < 280) fireBullet(game, assistant, "assistant", audio);
  } else {
    const pc = centerOf(game.player);
    const offsetX = game.player.dir === "left" ? 58 : game.player.dir === "right" ? -58 : -48;
    const offsetY = game.player.dir === "up" ? 58 : game.player.dir === "down" ? -58 : 44;
    moveTankToward(game, assistant, pc.x + offsetX, pc.y + offsetY, dt);
  }
}

function updatePlayer(game: Game, input: InputState, dt: number, audio?: ArcadeAudio | null) {
  game.player.speed = game.speedBoostTimer > 0 ? PLAYER_BOOST_SPEED : PLAYER_BASE_SPEED;
  game.player.cooldown = Math.max(0, game.player.cooldown - dt);

  let dir: Dir | null = null;
  if (input.up) dir = "up";
  else if (input.down) dir = "down";
  else if (input.left) dir = "left";
  else if (input.right) dir = "right";

  if (dir) {
    game.player.dir = dir;
    moveTank(game, game.player, dt);
  }

  if (input.fire) fireBullet(game, game.player, "player", audio);

  for (const power of game.powerUps) {
    if (rectsOverlap(game.player, power)) {
      game.speedBoostTimer = Math.max(game.speedBoostTimer, 8);
      game.powerUps = [];
      game.message = "SPEED BOOST ACTIVE";
      game.messageTimer = 1.5;
      audio?.play("power");
      break;
    }
  }
}

function updateGame(game: Game, input: InputState, dt: number, audio?: ArcadeAudio | null) {
  if (game.status !== "playing") return;

  game.time += dt;
  game.shake = Math.max(0, game.shake - dt);
  game.playerInvincible = Math.max(0, game.playerInvincible - dt);
  game.messageTimer = Math.max(0, game.messageTimer - dt);
  game.speedBoostTimer = Math.max(0, game.speedBoostTimer - dt);

  updatePlayer(game, input, dt, audio);
  updateEnemies(game, dt, audio);
  updateBoss(game, dt, audio);
  updateAssistant(game, dt, audio);
  updateBullets(game, dt, audio);

  for (const p of game.powerUps) p.life -= dt;
  game.powerUps = game.powerUps.filter((p) => p.life > 0);

  for (const e of game.explosions) e.t += dt;
  game.explosions = game.explosions.filter((e) => e.t < e.life);

  if (game.kills >= TARGET_KILLS && game.enemies.length === 0 && !game.bossSpawned) {
    spawnBoss(game, audio);
  } else if (!game.bossSpawned) {
    spawnNormalEnemies(game);
  }
}

function drawBlockText(ctx: CanvasRenderingContext2D, text: string, startX: number, startY: number, pixel: number, gap = 1) {
  let x = startX;
  for (const char of text.toUpperCase()) {
    const glyph = FONT[char] || FONT[" "];
    const glyphWidth = glyph[0]?.length || 3;
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === "1") ctx.fillRect(x + col * pixel, startY + row * pixel, pixel - 1, pixel - 1);
      }
    }
    x += glyphWidth * pixel + gap * pixel;
  }
}

function drawTerrain(ctx: CanvasRenderingContext2D, terrain: Terrain, time: number) {
  if (terrain.kind === "grass") {
    ctx.fillStyle = "rgba(22, 101, 52, 0.76)";
    ctx.fillRect(terrain.x, terrain.y, terrain.w, terrain.h);
    ctx.fillStyle = "rgba(74, 222, 128, 0.35)";
    for (let y = terrain.y + 4; y < terrain.y + terrain.h; y += 10) {
      for (let x = terrain.x + 2; x < terrain.x + terrain.w; x += 12) {
        const sway = Math.sin(time * 3 + x * 0.1 + y * 0.08) * 2;
        ctx.fillRect(x + sway, y, 3, 8);
      }
    }
    return;
  }

  ctx.fillStyle = "rgba(14, 116, 144, 0.86)";
  ctx.fillRect(terrain.x, terrain.y, terrain.w, terrain.h);
  ctx.fillStyle = "rgba(165, 243, 252, 0.45)";
  for (let y = terrain.y + 7; y < terrain.y + terrain.h; y += 14) {
    for (let x = terrain.x + 6; x < terrain.x + terrain.w; x += 26) {
      const wave = Math.sin(time * 4 + x * 0.08) * 3;
      ctx.fillRect(x + wave, y, 16, 3);
    }
  }
}

function drawBrick(ctx: CanvasRenderingContext2D, w: Wall) {
  ctx.fillStyle = "#b92d10";
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = "#ef6427";
  ctx.fillRect(w.x + 2, w.y + 2, w.w - 4, 4);
  ctx.fillRect(w.x + 2, w.y + 14, w.w - 4, 4);
  ctx.fillRect(w.x + 2, w.y + 26, w.w - 4, 4);
  ctx.fillStyle = "#66737d";
  ctx.fillRect(w.x, w.y + 9, w.w, 3);
  ctx.fillRect(w.x, w.y + 21, w.w, 3);
  ctx.fillRect(w.x + 15, w.y, 3, 10);
  ctx.fillRect(w.x + 7, w.y + 12, 3, 10);
  ctx.fillRect(w.x + 22, w.y + 24, 3, 8);
}

function drawStone(ctx: CanvasRenderingContext2D, w: Wall) {
  const ratio = w.hp / w.maxHp;
  ctx.fillStyle = ratio > 0.5 ? "#a3a8ad" : "#858c94";
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = "#dadde0";
  ctx.fillRect(w.x + 3, w.y + 3, 10, 10);
  ctx.fillRect(w.x + 18, w.y + 4, 10, 9);
  ctx.fillRect(w.x + 4, w.y + 18, 11, 9);
  ctx.fillRect(w.x + 19, w.y + 17, 9, 11);
  ctx.fillStyle = "#5f676f";
  ctx.fillRect(w.x, w.y + 14, w.w, 3);
  ctx.fillRect(w.x + 15, w.y, 3, w.h);
  if (ratio < 1) {
    ctx.strokeStyle = `rgba(30,30,30,${1 - ratio + 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w.x + 5, w.y + 6);
    ctx.lineTo(w.x + 14, w.y + 13);
    ctx.lineTo(w.x + 10, w.y + 22);
    ctx.stroke();
  }
}

function drawMetal(ctx: CanvasRenderingContext2D, w: Wall) {
  const g = ctx.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
  g.addColorStop(0, "#f3f5f7");
  g.addColorStop(0.45, "#9ca5ad");
  g.addColorStop(1, "#5e6870");
  ctx.fillStyle = g;
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 2;
  ctx.strokeRect(w.x + 3, w.y + 3, w.w - 6, w.h - 6);
  ctx.fillStyle = "#434b52";
  ctx.fillRect(w.x + 7, w.y + 7, 5, 5);
  ctx.fillRect(w.x + 20, w.y + 7, 5, 5);
  ctx.fillRect(w.x + 7, w.y + 20, 5, 5);
  ctx.fillRect(w.x + 20, w.y + 20, 5, 5);
}

function drawTank(ctx: CanvasRenderingContext2D, game: Game, tank: Tank, invincible = false) {
  if (invincible && Math.floor(performance.now() / 90) % 2 === 0) return;
  const inGrass = isInGrass(game, tank);
  if (inGrass) ctx.globalAlpha = 0.58;

  const angle = tank.dir === "up" ? 0 : tank.dir === "right" ? Math.PI / 2 : tank.dir === "down" ? Math.PI : -Math.PI / 2;
  const cx = tank.x + tank.w / 2;
  const cy = tank.y + tank.h / 2;
  let body = "#f3bb4b";
  let tread = "#8b5b1c";
  let top = "#ffe28a";
  if (tank.kind === "enemy") { body = "#28c76f"; tread = "#116b3b"; top = "#a8ffd0"; }
  if (tank.kind === "boss") { body = "#e5314f"; tread = "#4a0c18"; top = "#ff9aad"; }
  if (tank.kind === "assistant") { body = "#60a5fa"; tread = "#1d4ed8"; top = "#dbeafe"; }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = tread;
  ctx.fillRect(-tank.w / 2, -tank.h / 2, 7, tank.h);
  ctx.fillRect(tank.w / 2 - 7, -tank.h / 2, 7, tank.h);
  ctx.fillStyle = "#111827";
  for (let y = -tank.h / 2 + 3; y < tank.h / 2; y += 8) {
    ctx.fillRect(-tank.w / 2 + 1, y, 5, 3);
    ctx.fillRect(tank.w / 2 - 6, y, 5, 3);
  }
  ctx.fillStyle = body;
  ctx.fillRect(-tank.w / 2 + 7, -tank.h / 2 + 4, tank.w - 14, tank.h - 8);
  ctx.fillStyle = top;
  ctx.fillRect(-tank.w * 0.22, -tank.h * 0.28, tank.w * 0.44, tank.h * 0.56);
  ctx.fillStyle = body;
  ctx.fillRect(-3, -tank.h / 2 - tank.h * 0.35, 6, tank.h * 0.55);
  ctx.fillStyle = "#fff6c6";
  ctx.fillRect(-tank.w / 2 + 10, -tank.h / 2 + 7, 5, 5);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawGame(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, game: Game) {
  const cssW = canvas.clientWidth || window.innerWidth;
  const cssH = canvas.clientHeight || window.innerHeight;
  const dpr = canvas.width / Math.max(1, cssW);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const portrait = cssH > cssW;
  const small = cssW < 900;
  const safeTop = small ? 96 : 76;
  const safeBottom = portrait ? 238 : small ? 142 : 48;
  const availableW = cssW;
  const availableH = Math.max(120, cssH - safeTop - safeBottom);
  const scale = Math.min(availableW / WORLD_W, availableH / WORLD_H);
  const ox = (cssW - WORLD_W * scale) / 2;
  const oy = safeTop + (availableH - WORLD_H * scale) / 2;
  const shakeX = game.shake > 0 ? Math.sin(game.time * 80) * game.shake * 16 : 0;
  const shakeY = game.shake > 0 ? Math.cos(game.time * 70) * game.shake * 12 : 0;

  ctx.fillStyle = "#020403";
  ctx.fillRect(0, 0, cssW, cssH);

  ctx.save();
  ctx.translate(ox + shakeX, oy + shakeY);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "#020403";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  ctx.fillStyle = "rgba(255,255,255,0.032)";
  drawBlockText(ctx, "SHRIMO", 128, 310, 12, 1);
  drawBlockText(ctx, "INNOVATIONS", 116, 414, 10, 1);

  for (const terrain of game.terrain) drawTerrain(ctx, terrain, game.time);

  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD_W; x += CELL) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke();
  }
  for (let y = 0; y <= WORLD_H; y += CELL) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke();
  }

  for (const wall of game.walls) {
    if (wall.kind === "brick") drawBrick(ctx, wall);
    if (wall.kind === "stone") drawStone(ctx, wall);
    if (wall.kind === "metal") drawMetal(ctx, wall);
  }

  for (const p of game.powerUps) {
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#60a5fa";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#dbeafe";
    ctx.fillRect(p.x + 12, p.y + 3, 8, 10);
    ctx.fillRect(p.x + 10, p.y + 11, 8, 10);
    ctx.fillRect(p.x + 14, p.y + 19, 8, 10);
    ctx.globalAlpha = 1;
  }

  drawTank(ctx, game, game.player, game.playerInvincible > 0);
  if (game.assistant) drawTank(ctx, game, game.assistant);
  for (const enemy of game.enemies) drawTank(ctx, game, enemy);
  if (game.boss) drawTank(ctx, game, game.boss);

  for (const b of game.bullets) {
    ctx.fillStyle = b.owner === "player" ? "#ffd35a" : b.owner === "assistant" ? "#bfdbfe" : "#67e8f9";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(b.x + 1, b.y + 1, Math.max(2, b.w - 2), Math.max(2, b.h - 2));
  }

  for (const ex of game.explosions) {
    const p = ex.t / ex.life;
    const s = ex.size * (1 + p * 0.9);
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = "#fff7a8";
    ctx.fillRect(ex.x - s * 0.2, ex.y - s * 0.2, s * 0.4, s * 0.4);
    ctx.fillStyle = "#ff7a18";
    ctx.fillRect(ex.x - s * 0.5, ex.y - s * 0.08, s, s * 0.16);
    ctx.fillRect(ex.x - s * 0.08, ex.y - s * 0.5, s * 0.16, s);
    ctx.fillStyle = "#ef233c";
    ctx.fillRect(ex.x - s * 0.32, ex.y - s * 0.32, s * 0.2, s * 0.2);
    ctx.fillRect(ex.x + s * 0.16, ex.y + s * 0.16, s * 0.22, s * 0.22);
    ctx.globalAlpha = 1;
  }

  if (game.messageTimer > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.74)";
    ctx.fillRect(WORLD_W / 2 - 220, WORLD_H / 2 - 42, 440, 84);
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 3;
    ctx.strokeRect(WORLD_W / 2 - 220, WORLD_H / 2 - 42, 440, 84);
    ctx.fillStyle = "#facc15";
    ctx.textAlign = "center";
    ctx.font = "bold 26px monospace";
    ctx.fillText(game.message, WORLD_W / 2, WORLD_H / 2 + 9);
  }

  ctx.restore();
}

function snapshot(game: Game) {
  return {
    status: game.status,
    lives: game.lives,
    hp: game.playerHp,
    kills: game.kills,
    active: game.enemies.length + (game.boss ? 1 : 0),
    bossHp: game.bossHp,
    bossSpawned: game.bossSpawned,
    muted: game.muted,
    boost: game.speedBoostTimer,
    assistantActive: Boolean(game.assistant),
    assistantRespawn: game.assistantRespawn,
  };
}

export default function TankarGamePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keyboardRef = useRef<InputState>(copyInput(EMPTY_INPUT));
  const touchRef = useRef<InputState>(copyInput(EMPTY_INPUT));
  const gamepadRef = useRef<InputState>(copyInput(EMPTY_INPUT));
  const audioRef = useRef<ArcadeAudio | null>(null);
  const mutedRef = useRef(false);
  const gameRef = useRef<Game>(createGame("idle", false));
  const [hud, setHud] = useState(snapshot(gameRef.current));
  const [loaderReady, setLoaderReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoaderReady(true), 1350);
    return () => window.clearTimeout(timer);
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new ArcadeAudio();
    audioRef.current.muted = mutedRef.current;
    audioRef.current.ensure();
    return audioRef.current;
  }, []);

  const startGame = useCallback(() => {
    const audio = ensureAudio();
    const game = createGame("playing", mutedRef.current);
    spawnNormalEnemies(game);
    gameRef.current = game;
    keyboardRef.current = copyInput(EMPTY_INPUT);
    touchRef.current = copyInput(EMPTY_INPUT);
    setHud(snapshot(game));
    audio.play("start");
  }, [ensureAudio]);

  const togglePause = useCallback(() => {
    const game = gameRef.current;
    if (game.status === "playing") game.status = "paused";
    else if (game.status === "paused") game.status = "playing";
    setHud(snapshot(game));
  }, []);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    if (audioRef.current) audioRef.current.muted = mutedRef.current;
    gameRef.current.muted = mutedRef.current;
    setHud(snapshot(gameRef.current));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      else doc.webkitExitFullscreen?.();
    } else {
      if (root.requestFullscreen) root.requestFullscreen();
      else root.webkitRequestFullscreen?.();
    }
  }, []);

  const setTouch = useCallback((key: keyof InputState, value: boolean) => {
    touchRef.current = { ...touchRef.current, [key]: value };
  }, []);

  const clearTouch = useCallback(() => {
    touchRef.current = copyInput(EMPTY_INPUT);
  }, []);

  const makePadHandlers = (key: keyof InputState) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setTouch(key, true);
      ensureAudio();
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setTouch(key, false);
    },
    onPointerCancel: () => setTouch(key, false),
    onPointerLeave: () => setTouch(key, false),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    const setKeyInput = (code: string, value: boolean) => {
      const next = { ...keyboardRef.current };
      if (code === "ArrowUp" || code === "KeyW") next.up = value;
      if (code === "ArrowDown" || code === "KeyS") next.down = value;
      if (code === "ArrowLeft" || code === "KeyA") next.left = value;
      if (code === "ArrowRight" || code === "KeyD") next.right = value;
      if (code === "Space" || code === "Enter" || code === "NumpadEnter") next.fire = value;
      keyboardRef.current = next;
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    const down = (e: KeyboardEvent) => {
      const useful = [
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "Space", "Enter",
        "NumpadEnter", "KeyP", "KeyM", "KeyF", "Escape", "Backspace", "MediaPlayPause", "BrowserBack", "GoBack",
      ];
      if (useful.includes(e.code)) e.preventDefault();
      ensureAudio();
      setKeyInput(e.code, true);
      if (e.repeat) return;
      if ((e.code === "Enter" || e.code === "NumpadEnter") && ["idle", "gameover", "victory"].includes(gameRef.current.status)) startGame();
      if (e.code === "KeyP" || e.code === "MediaPlayPause") togglePause();
      if (e.code === "Escape" || e.code === "Backspace" || e.code === "BrowserBack" || e.code === "GoBack") {
        if (gameRef.current.status === "playing" || gameRef.current.status === "paused") togglePause();
      }
      if (e.code === "KeyM") toggleMute();
      if (e.code === "KeyF") toggleFullscreen();
    };

    const up = (e: KeyboardEvent) => setKeyInput(e.code, false);

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);

    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    let prevGamepadPause = false;
    let prevGamepadBack = false;

    const pollGamepad = () => {
      const pads = navigator.getGamepads?.() || [];
      const pad = Array.from(pads).find(Boolean);
      const next = copyInput(EMPTY_INPUT);
      if (!pad) {
        gamepadRef.current = next;
        return;
      }

      const axes = pad.axes || [];
      const buttons = pad.buttons || [];
      const axisX = axes[0] || 0;
      const axisY = axes[1] || 0;
      next.left = axisX < -0.35 || Boolean(buttons[14]?.pressed);
      next.right = axisX > 0.35 || Boolean(buttons[15]?.pressed);
      next.up = axisY < -0.35 || Boolean(buttons[12]?.pressed);
      next.down = axisY > 0.35 || Boolean(buttons[13]?.pressed);
      next.fire = Boolean(buttons[0]?.pressed || buttons[7]?.pressed);
      gamepadRef.current = next;

      const pausePressed = Boolean(buttons[9]?.pressed || buttons[8]?.pressed);
      const backPressed = Boolean(buttons[1]?.pressed);
      if (pausePressed && !prevGamepadPause) togglePause();
      if (backPressed && !prevGamepadBack && (gameRef.current.status === "playing" || gameRef.current.status === "paused")) togglePause();
      prevGamepadPause = pausePressed;
      prevGamepadBack = backPressed;
    };

    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      pollGamepad();
      const input = mergeInputs(keyboardRef.current, touchRef.current, gamepadRef.current);
      updateGame(gameRef.current, input, dt, audioRef.current);
      drawGame(ctx, canvas, gameRef.current);
      if (now - lastHud > 90) {
        setHud(snapshot(gameRef.current));
        lastHud = now;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [ensureAudio, startGame, toggleFullscreen, toggleMute, togglePause]);

  const overlayVisible = loaderReady && (hud.status === "idle" || hud.status === "paused" || hud.status === "victory" || hud.status === "gameover");

  return (
    <main className="gameShell" onPointerCancel={clearTouch} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} />

      <section className="hud" aria-label="Game status">
        <div className="brand"><span className="dot" />TANKAR</div>
        <div className="stats">
          <span>Lives: {hud.lives}/3</span>
          <span>HP: {hud.hp}/10</span>
          <span>Kills: {hud.kills}/50</span>
          <span>Active: {hud.active}</span>
          <span className={hud.assistantActive ? "assistantOk" : "assistantDown"}>
            {hud.assistantActive ? "Assistant: Active" : `Assistant: ${hud.assistantRespawn.toFixed(0)}s`}
          </span>
          {hud.boost > 0 && <span className="boost">Boost: {hud.boost.toFixed(1)}s</span>}
          {hud.bossSpawned && <span className="boss">Boss HP: {hud.bossHp}/20</span>}
        </div>
        <div className="actions">
          <button onClick={toggleMute}>{hud.muted ? "Unmute" : "Mute"}</button>
          <button onClick={togglePause}>{hud.status === "paused" ? "Resume" : "Pause"}</button>
          <button onClick={toggleFullscreen}>Full</button>
        </div>
      </section>

      <section className="touchControls" aria-label="Touch and TV controls">
        <div className="dpad">
          <button className="pad up" aria-label="Move up" {...makePadHandlers("up")}>▲</button>
          <button className="pad left" aria-label="Move left" {...makePadHandlers("left")}>◀</button>
          <button className="pad right" aria-label="Move right" {...makePadHandlers("right")}>▶</button>
          <button className="pad down" aria-label="Move down" {...makePadHandlers("down")}>▼</button>
        </div>
        <div className="fireCluster">
          <button className="fire" aria-label="Fire" {...makePadHandlers("fire")}>FIRE</button>
          <button className="mini" onClick={togglePause}>Pause</button>
          <button className="mini" onClick={toggleMute}>{hud.muted ? "Sound" : "Mute"}</button>
        </div>
      </section>

      <section className="help">
        Desktop: WASD/Arrows + Space · TV: D-pad + OK/Enter · Mobile: D-pad + Fire · Pause: P/Back · Fullscreen: F
      </section>

      <section className="rotateHint">Rotate for best gameplay</section>

      {!loaderReady && (
        <section className="overlay loaderOverlay" aria-label="Loading and policies">
          <div className="panel loaderPanel">
            <p className="eyebrow">Shrimo Innovations</p>
            <h1>TANKAR</h1>
            <p>Loading the battlefield, controls, assistant tank, terrain, and safety information.</p>
            <div className="loaderBar"><span /></div>
            <nav className="policyLinks" aria-label="Game policy links">
              <a href="terms/">Terms</a>
              <a href="privacy/">Privacy</a>
              <a href="cookies/">Cookies</a>
              <a href="responsible-gaming/">Responsible Play</a>
              <a href="fair-play/">Fair Play</a>
              <a href="refund/">Refund</a>
              <a href="disclaimer/">Disclaimer</a>
              <a href="contact/">Contact</a>
            </nav>
            <p className="legalNote">Free arcade game only. No real-money gaming, betting, gambling, prizes, or user-generated public chat.</p>
          </div>
        </section>
      )}

      {overlayVisible && (
        <section className="overlay">
          <div className="panel">
            {hud.status === "idle" && (
              <>
                <p className="eyebrow">Desktop · Mobile · Android TV</p>
                <h1>TANKAR BATTLE</h1>
                <p>Destroy 50 slow enemy tanks, survive 10 hits per life, use grass for hiding, avoid water, collect speed powers, and defeat the master tank.</p>
                <button className="primary" onClick={startGame} autoFocus>Start Game</button>
                <nav className="policyLinks compact" aria-label="Policy links">
                  <a href="terms/">Terms</a>
                  <a href="privacy/">Privacy</a>
                  <a href="responsible-gaming/">Responsible Play</a>
                  <a href="contact/">Contact</a>
                </nav>
              </>
            )}
            {hud.status === "paused" && (
              <>
                <p className="eyebrow">Game paused</p>
                <h1>PAUSED</h1>
                <p>Resume with the button, P, TV Play/Pause, Back, or gamepad Start.</p>
                <button className="primary" onClick={togglePause} autoFocus>Resume</button>
              </>
            )}
            {hud.status === "gameover" && (
              <>
                <p className="eyebrow">Mission failed</p>
                <h1>GAME OVER</h1>
                <p>You lost all 3 lives. Restart and clear the full enemy wave.</p>
                <button className="primary" onClick={startGame} autoFocus>Restart</button>
              </>
            )}
            {hud.status === "victory" && (
              <>
                <p className="eyebrow">Mission complete</p>
                <h1>VICTORY</h1>
                <p>You destroyed 50 tanks and defeated the master enemy tank.</p>
                <button className="primary" onClick={startGame} autoFocus>Play Again</button>
              </>
            )}
          </div>
        </section>
      )}

      <style jsx global>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #020403; overscroll-behavior: none; }
        body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
        button { font: inherit; user-select: none; touch-action: none; }
        button:focus-visible { outline: 3px solid #fff; outline-offset: 3px; box-shadow: 0 0 0 7px rgba(250, 204, 21, 0.35); }
        .gameShell {
          position: fixed; inset: 0; overflow: hidden; color: white; touch-action: none;
          padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
          background:
            radial-gradient(circle at 50% 20%, rgba(255, 195, 67, 0.12), transparent 30%),
            radial-gradient(circle at 70% 70%, rgba(103, 232, 249, 0.08), transparent 35%),
            #020403;
        }
        canvas { position: absolute; inset: 0; width: 100vw; height: 100vh; image-rendering: pixelated; }
        .hud {
          position: absolute; z-index: 5; top: max(12px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
          width: min(1220px, calc(100vw - 24px)); min-height: 62px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 12px 10px 16px; border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(8, 12, 15, 0.82); backdrop-filter: blur(14px); box-shadow: 0 18px 60px rgba(0,0,0,0.45);
        }
        .brand { display: flex; align-items: center; gap: 10px; font-weight: 900; letter-spacing: 0.18em; text-shadow: 2px 2px 0 #7f1d1d; white-space: nowrap; }
        .dot { width: 12px; height: 12px; background: #facc15; box-shadow: 0 0 0 4px rgba(250,204,21,0.18); }
        .stats { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 7px; font-size: 12px; }
        .stats span { padding: 7px 9px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.9); }
        .stats .boss { color: #fecdd3; border-color: rgba(248,113,113,0.45); background: rgba(127,29,29,0.45); }
        .stats .boost { color: #dbeafe; border-color: rgba(96,165,250,0.45); background: rgba(30,64,175,0.45); }
        .stats .assistantOk { color: #bbf7d0; border-color: rgba(74,222,128,0.38); background: rgba(20,83,45,0.48); }
        .stats .assistantDown { color: #fed7aa; border-color: rgba(251,146,60,0.38); background: rgba(124,45,18,0.48); }
        .actions { display: flex; gap: 8px; }
        .actions button, .primary, .mini, .pad, .fire {
          border: 0; color: #07100b; background: #facc15; cursor: pointer;
          box-shadow: inset 0 -3px 0 rgba(0,0,0,0.22); transition: transform 140ms ease, filter 140ms ease;
        }
        .actions button { padding: 10px 12px; }
        .actions button:hover, .primary:hover, .mini:hover, .pad:hover, .fire:hover { transform: translateY(-1px); filter: brightness(1.08); }
        .help {
          position: absolute; z-index: 4; left: 50%; bottom: max(12px, env(safe-area-inset-bottom)); transform: translateX(-50%);
          width: min(1120px, calc(100vw - 24px)); padding: 9px 12px; text-align: center; font-size: 11px;
          line-height: 1.45; color: rgba(255,255,255,0.72); border: 1px solid rgba(255,255,255,0.1);
          background: rgba(0,0,0,0.52); backdrop-filter: blur(10px);
        }
        .touchControls {
          position: absolute; z-index: 6; inset: auto 0 max(44px, calc(env(safe-area-inset-bottom) + 42px)) 0;
          display: none; justify-content: space-between; align-items: flex-end; pointer-events: none; padding: 0 18px;
        }
        .dpad { position: relative; width: 168px; height: 168px; pointer-events: auto; }
        .pad, .fire, .mini { min-width: 56px; min-height: 56px; border-radius: 18px; background: rgba(250,204,21,0.88); font-weight: 900; }
        .pad { position: absolute; width: 56px; height: 56px; }
        .pad.up { left: 56px; top: 0; }
        .pad.left { left: 0; top: 56px; }
        .pad.right { right: 0; top: 56px; }
        .pad.down { left: 56px; bottom: 0; }
        .fireCluster { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; pointer-events: auto; align-items: end; }
        .fire { grid-column: span 2; width: 132px; height: 76px; border-radius: 999px; background: rgba(248,113,113,0.92); color: #fff; text-shadow: 1px 1px 0 rgba(0,0,0,0.35); }
        .mini { min-width: 62px; min-height: 48px; border-radius: 14px; font-size: 11px; }
        .rotateHint {
          display: none;
          position: absolute; z-index: 7; right: 14px; top: 104px; padding: 8px 10px; border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.58); color: rgba(255,255,255,0.76); font-size: 11px;
        }
        .overlay {
          position: absolute; z-index: 10; inset: 0; display: grid; place-items: center; padding: 24px;
          background: linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.72)), repeating-linear-gradient(0deg, rgba(255,255,255,0.035), rgba(255,255,255,0.035) 1px, transparent 1px, transparent 5px);
        }
        .panel {
          width: min(590px, 100%); padding: 34px; text-align: center; border: 1px solid rgba(250,204,21,0.45);
          background: rgba(5,8,11,0.9); box-shadow: 0 30px 90px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08);
        }
        .eyebrow { margin: 0 0 12px; color: #facc15; font-size: 12px; text-transform: uppercase; letter-spacing: 0.18em; }
        h1 { margin: 0; font-size: clamp(42px, 7vw, 82px); line-height: 0.9; color: #fff; text-shadow: 4px 4px 0 #7f1d1d; }
        .panel p:not(.eyebrow) { margin: 18px auto 24px; max-width: 500px; color: rgba(255,255,255,0.74); line-height: 1.65; font-size: 15px; }
        .primary { min-width: 190px; min-height: 56px; padding: 12px 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; border-radius: 16px; }
        .loaderPanel { overflow: hidden; }
        .loaderBar { width: min(360px, 100%); height: 10px; margin: 18px auto 18px; border: 1px solid rgba(250,204,21,0.45); background: rgba(255,255,255,0.08); }
        .loaderBar span { display: block; width: 100%; height: 100%; background: linear-gradient(90deg, #facc15, #fb7185, #60a5fa); transform-origin: left; animation: loadSweep 1.25s ease both; }
        .policyLinks { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 14px; }
        .policyLinks a { color: #fef3c7; text-decoration: none; border: 1px solid rgba(250,204,21,0.28); background: rgba(250,204,21,0.08); padding: 7px 9px; font-size: 11px; }
        .policyLinks a:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
        .policyLinks a:hover { background: rgba(250,204,21,0.16); }
        .policyLinks.compact { margin-top: 18px; }
        .legalNote { font-size: 11px !important; line-height: 1.55 !important; color: rgba(255,255,255,0.6) !important; margin-bottom: 0 !important; }
        @keyframes loadSweep { from { transform: scaleX(0.04); } to { transform: scaleX(1); } }
        @media (max-width: 920px), (pointer: coarse) {
          .touchControls { display: flex; }
          .help { font-size: 10px; bottom: max(8px, env(safe-area-inset-bottom)); }
          .hud { top: max(8px, env(safe-area-inset-top)); width: calc(100vw - 16px); min-height: 76px; flex-direction: column; align-items: stretch; padding: 8px; gap: 7px; }
          .brand, .actions, .stats { justify-content: center; }
          .actions button { min-height: 40px; padding: 8px 10px; }
          .stats { font-size: 10px; gap: 5px; }
          .stats span { padding: 5px 7px; }
          .panel { padding: 24px; }
        }
        @media (orientation: portrait) {
          .rotateHint { display: block; }
          .touchControls { bottom: max(54px, calc(env(safe-area-inset-bottom) + 42px)); padding: 0 14px; }
          .dpad { width: 154px; height: 154px; }
          .pad { width: 52px; height: 52px; min-width: 52px; min-height: 52px; }
          .pad.up { left: 51px; }
          .pad.left { top: 51px; }
          .pad.right { top: 51px; }
          .pad.down { left: 51px; }
          .fire { width: 112px; height: 72px; }
          .mini { min-width: 52px; min-height: 44px; }
          .help { display: none; }
        }
        @media (min-width: 1200px) and (min-height: 680px) {
          .stats { font-size: 13px; }
          .hud { min-height: 60px; }
        }
      `}</style>
    </main>
  );
}
