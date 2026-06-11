"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type Dir = "up" | "down" | "left" | "right";
type WallKind = "brick" | "stone" | "metal";
type TerrainKind = "grass" | "water";
type Status = "idle" | "playing" | "paused" | "victory" | "gameover";
type Owner = "player" | "enemy" | "drone";

type Rect = { x: number; y: number; w: number; h: number };

type Wall = Rect & { id: number; kind: WallKind; hp: number; maxHp: number };
type Terrain = Rect & { id: number; kind: TerrainKind };
type Tank = Rect & { id: string; kind: "player" | "enemy" | "boss" | "helper"; dir: Dir; speed: number; cooldown: number; aiTimer: number; hp: number; fast?: boolean };
type Drone = Rect & { id: string; team: "friendly" | "enemy"; speed: number; cooldown: number; angle: number; spark: number };
type Bullet = Rect & { id: string; owner: Owner; sourceId: string; dir: Dir; speed: number; dead?: boolean };
type Explosion = { id: string; x: number; y: number; t: number; life: number; size: number };
type PowerUp = Rect & { id: string; kind: "speed"; life: number };
type Missile = { active: boolean; x: number; y: number; vx: number; vy: number; speed: number };

type InputState = { up: boolean; down: boolean; left: boolean; right: boolean; fire: boolean };

type Game = {
  status: Status;
  walls: Wall[];
  terrain: Terrain[];
  player: Tank;
  helper: Tank;
  enemies: Tank[];
  boss: Tank | null;
  friendlyDrones: Drone[];
  enemyDrone: Drone | null;
  enemyDroneHp: number;
  enemyDroneDestroyed: boolean;
  enemyDroneAggroTimer: number;
  missile: Missile | null;
  missileLaunched: boolean;
  bossDelay: number;
  bullets: Bullet[];
  explosions: Explosion[];
  powerUps: PowerUp[];
  lives: number;
  playerHp: number;
  kills: number;
  normalSpawned: number;
  fastSpawned: number;
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

const CELL = 58;
const COLS = 17;
const ROWS = 11;
const WORLD_W = COLS * CELL;
const WORLD_H = ROWS * CELL;

const PLAYER_SIZE = 54;
const ENEMY_SIZE = 52;
const HELPER_TANK_SIZE = 50;
const BOSS_SIZE = ENEMY_SIZE;
const FRIENDLY_DRONE_SIZE = 34;
const ENEMY_DRONE_SIZE = 46;

const TARGET_KILLS = 20;
const ACTIVE_ENEMIES = 6;
const ENEMY_MAX_HP = 40;
const ENEMY_DRONE_MAX_HP = 120;
const PLAYER_LIVES = 3;
const PLAYER_HP_PER_LIFE = 10;
const BOSS_MAX_HP = 80;

const PLAYER_BASE_SPEED = 285;
const PLAYER_BOOST_SPEED = 380;
const ENEMY_SPEED = 58;
const ENEMY_FAST_SPEED = 162;
const TOTAL_FAST_ENEMIES = 4;
const ACTIVE_FAST_ENEMIES = 4;
const BOSS_SPEED = 285;
const FRIENDLY_DRONE_SPEED = 610;
const ENEMY_DRONE_SPEED = 135;
const HELPER_TANK_SPEED = 118;

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


type CaptchaChallenge = { question: string; answer: number };

function createCaptchaChallenge(): CaptchaChallenge {
  const op = ["+", "-", "×", "÷"][Math.floor(Math.random() * 4)];
  const a = 2 + Math.floor(Math.random() * 18);
  const b = 2 + Math.floor(Math.random() * 12);

  if (op === "+") {
    const c = 1 + Math.floor(Math.random() * 9);
    return { question: `${a} + ${b} + ${c}`, answer: a + b + c };
  }
  if (op === "-") {
    const big = a + b + 10;
    return { question: `${big} - ${b}`, answer: big - b };
  }
  if (op === "×") {
    return { question: `${a} × ${b}`, answer: a * b };
  }

  const answer = 2 + Math.floor(Math.random() * 12);
  const divisor = 2 + Math.floor(Math.random() * 9);
  return { question: `${answer * divisor} ÷ ${divisor}`, answer };
}

function copyInput(input: InputState): InputState {
  return { up: input.up, down: input.down, left: input.left, right: input.right, fire: input.fire };
}

function mergeInputs(a: InputState, b: InputState, c: InputState): InputState {
  return { up: a.up || b.up || c.up, down: a.down || b.down || c.down, left: a.left || b.left || c.left, right: a.right || b.right || c.right, fire: a.fire || b.fire || c.fire };
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rand(game: Game) {
  game.seed = (game.seed * 1664525 + 1013904223) >>> 0;
  return game.seed / 4294967296;
}

function addExplosion(game: Game, x: number, y: number, size = 26, life = 0.35) {
  game.explosions.push({ id: `ex-${performance.now()}-${Math.random()}`, x, y, t: 0, life, size });
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

  play(type: "shoot" | "hit" | "boom" | "life" | "boss" | "win" | "lose" | "start" | "power" | "spark" | "missile") {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    let freq = 220;
    let duration = 0.12;
    let wave: OscillatorType = "square";
    if (type === "shoot") { freq = 520; duration = 0.04; }
    if (type === "hit") { freq = 140; duration = 0.08; wave = "sawtooth"; }
    if (type === "spark") { freq = 950; duration = 0.055; }
    if (type === "boom") { freq = 68; duration = 0.24; wave = "sawtooth"; }
    if (type === "life") { freq = 95; duration = 0.34; wave = "triangle"; }
    if (type === "boss") { freq = 55; duration = 0.55; wave = "sawtooth"; }
    if (type === "win") { freq = 720; duration = 0.45; }
    if (type === "lose") { freq = 82; duration = 0.55; wave = "sawtooth"; }
    if (type === "start") { freq = 320; duration = 0.18; }
    if (type === "power") { freq = 780; duration = 0.22; wave = "triangle"; }
    if (type === "missile") { freq = 115; duration = 0.5; wave = "sawtooth"; }
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(35, freq * 0.45), ctx.currentTime + duration);
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

  // Larger readable terrain zones for the new big-cell battlefield.
  rect(2, 1, 3, 1, "grass");
  rect(12, 1, 3, 1, "grass");
  rect(2, 8, 3, 2, "grass");
  rect(12, 8, 3, 2, "grass");
  rect(7, 4, 3, 3, "grass");
  rect(5, 3, 1, 2, "water");
  rect(11, 3, 1, 2, "water");
  rect(5, 7, 1, 2, "water");
  rect(11, 7, 1, 2, "water");
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

  // Big readable cover blocks. Fewer cells keep movement clear on mobile.
  rect(3, 1, 1, 1, "brick");
  rect(13, 1, 1, 1, "brick");
  rect(7, 1, 3, 1, "stone");
  rect(1, 4, 1, 2, "brick");
  rect(15, 4, 1, 2, "brick");
  rect(4, 4, 1, 1, "metal");
  rect(12, 4, 1, 1, "metal");
  rect(7, 3, 1, 2, "brick");
  rect(9, 3, 1, 2, "brick");
  rect(7, 7, 1, 2, "brick");
  rect(9, 7, 1, 2, "brick");
  rect(4, 6, 1, 1, "stone");
  rect(12, 6, 1, 1, "stone");
  rect(1, 7, 1, 2, "brick");
  rect(15, 7, 1, 2, "brick");
  rect(7, 9, 3, 1, "metal");
  rect(3, 9, 1, 1, "brick");
  rect(13, 9, 1, 1, "brick");

  const clearZones: Rect[] = [
    { x: 0, y: 0, w: CELL * 3, h: CELL * 3 },
    { x: WORLD_W - CELL * 3, y: 0, w: CELL * 3, h: CELL * 3 },
    { x: 0, y: WORLD_H - CELL * 3, w: CELL * 3, h: CELL * 3 },
    { x: WORLD_W - CELL * 3, y: WORLD_H - CELL * 3, w: CELL * 3, h: CELL * 3 },
    { x: CELL * 6, y: CELL * 4, w: CELL * 5, h: CELL * 3 },
  ];
  return walls.filter((w) => !clearZones.some((z) => rectsOverlap(w, z)));
}

function createPlayer(): Tank {
  return { id: "player", kind: "player", x: WORLD_W / 2 - PLAYER_SIZE / 2, y: WORLD_H / 2 - PLAYER_SIZE / 2, w: PLAYER_SIZE, h: PLAYER_SIZE, dir: "up", speed: PLAYER_BASE_SPEED, cooldown: 0, aiTimer: 0, hp: 0 };
}

function createHelperTank(player: Tank): Tank {
  return {
    id: "helper",
    kind: "helper",
    x: player.x - CELL * 1.05,
    y: player.y + CELL * 0.85,
    w: HELPER_TANK_SIZE,
    h: HELPER_TANK_SIZE,
    dir: "up",
    speed: HELPER_TANK_SPEED,
    cooldown: 0,
    aiTimer: 0,
    hp: 1,
  };
}

function createFriendlyDrones(player: Tank): Drone[] {
  return [
    { id: "drone-a", team: "friendly", x: player.x - 92, y: player.y + 48, w: FRIENDLY_DRONE_SIZE, h: FRIENDLY_DRONE_SIZE, speed: FRIENDLY_DRONE_SPEED, cooldown: 0, angle: 0, spark: 0 },
    { id: "drone-b", team: "friendly", x: player.x + 92, y: player.y + 48, w: FRIENDLY_DRONE_SIZE, h: FRIENDLY_DRONE_SIZE, speed: FRIENDLY_DRONE_SPEED, cooldown: 0, angle: Math.PI, spark: 0 },
  ];
}

function createEnemyDrone(): Drone {
  return { id: "enemy-drone", team: "enemy", x: WORLD_W / 2 - ENEMY_DRONE_SIZE / 2, y: CELL * 1.3, w: ENEMY_DRONE_SIZE, h: ENEMY_DRONE_SIZE, speed: ENEMY_DRONE_SPEED, cooldown: 0, angle: 0, spark: 0 };
}

function createGame(status: Status = "idle", muted = false): Game {
  const player = createPlayer();
  const helper = createHelperTank(player);
  return {
    status,
    walls: buildWalls(),
    terrain: buildTerrain(),
    player,
    helper,
    enemies: [],
    boss: null,
    friendlyDrones: createFriendlyDrones(player),
    enemyDrone: createEnemyDrone(),
    enemyDroneHp: ENEMY_DRONE_MAX_HP,
    enemyDroneDestroyed: false,
    enemyDroneAggroTimer: 0,
    missile: null,
    missileLaunched: false,
    bossDelay: 0,
    bullets: [],
    explosions: [],
    powerUps: [],
    lives: PLAYER_LIVES,
    playerHp: PLAYER_HP_PER_LIFE,
    kills: 0,
    normalSpawned: 0,
    fastSpawned: 0,
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

function tankCollider(tank: Tank): Rect {
  const inset = tank.kind === "helper" ? 7 : 8;
  return { x: tank.x + inset, y: tank.y + inset, w: tank.w - inset * 2, h: tank.h - inset * 2 };
}

function isWaterBlocked(game: Game, rect: Rect) {
  return game.terrain.some((t) => t.kind === "water" && rectsOverlap(rect, t));
}

function isInGrass(game: Game, rect: Rect) {
  return game.terrain.some((t) => t.kind === "grass" && rectsOverlap(rect, t));
}

function isTankBlocked(game: Game, tank: Tank, nx: number, ny: number) {
  const nextTank = { ...tank, x: nx, y: ny };
  const next = tankCollider(nextTank);
  if (next.x < 0 || next.y < 0 || next.x + next.w > WORLD_W || next.y + next.h > WORLD_H) return true;
  if (game.walls.some((w) => rectsOverlap(next, w))) return true;
  if (isWaterBlocked(game, next)) return true;
  if (tank.id !== "player" && rectsOverlap(next, tankCollider(game.player))) return true;
  if (tank.id !== "helper" && rectsOverlap(next, tankCollider(game.helper))) return true;
  for (const e of game.enemies) if (e.id !== tank.id && rectsOverlap(next, tankCollider(e))) return true;
  if (game.boss && game.boss.id !== tank.id && rectsOverlap(next, tankCollider(game.boss))) return true;
  return false;
}

function moveTank(game: Game, tank: Tank, dt: number) {
  const v = dirVector(tank.dir);
  let moved = false;
  const nx = tank.x + v.dx * tank.speed * dt;
  const ny = tank.y + v.dy * tank.speed * dt;
  if (v.dx !== 0 && !isTankBlocked(game, tank, nx, tank.y)) { tank.x = nx; moved = true; }
  if (v.dy !== 0 && !isTankBlocked(game, tank, tank.x, ny)) { tank.y = ny; moved = true; }
  return moved;
}

function moveDroneToward(drone: Drone, tx: number, ty: number, dt: number, slow = 1) {
  const c = centerOf(drone);
  const dx = tx - c.x;
  const dy = ty - c.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const step = drone.speed * slow * dt;
  drone.x += (dx / d) * Math.min(step, d);
  drone.y += (dy / d) * Math.min(step, d);
  drone.x = Math.max(-20, Math.min(WORLD_W - drone.w + 20, drone.x));
  drone.y = Math.max(-20, Math.min(WORLD_H - drone.h + 20, drone.y));
  drone.angle = Math.atan2(dy, dx);
}

function isAreaFree(game: Game, r: Rect, allowPlayer = false) {
  if (r.x < 0 || r.y < 0 || r.x + r.w > WORLD_W || r.y + r.h > WORLD_H) return false;
  if (game.walls.some((w) => rectsOverlap(r, w))) return false;
  if (isWaterBlocked(game, r)) return false;
  if (!allowPlayer && rectsOverlap(r, tankCollider(game.player))) return false;
  if (rectsOverlap(r, tankCollider(game.helper))) return false;
  if (game.enemies.some((e) => rectsOverlap(r, tankCollider(e)))) return false;
  if (game.boss && rectsOverlap(r, tankCollider(game.boss))) return false;
  return true;
}

function spawnNormalEnemies(game: Game) {
  const points = [
    { gx: 1, gy: 1, dir: "down" as Dir }, { gx: 15, gy: 1, dir: "down" as Dir },
    { gx: 1, gy: 9, dir: "up" as Dir }, { gx: 15, gy: 9, dir: "up" as Dir },
    { gx: 8, gy: 1, dir: "down" as Dir }, { gx: 8, gy: 9, dir: "up" as Dir },
    { gx: 1, gy: 5, dir: "right" as Dir }, { gx: 15, gy: 5, dir: "left" as Dir },
  ];
  let guard = 0;
  while (game.enemies.length < ACTIVE_ENEMIES && game.normalSpawned < TARGET_KILLS && guard < 200) {
    guard++;
    const p = points[(game.normalSpawned + guard) % points.length];
    const r = { x: p.gx * CELL + (CELL - ENEMY_SIZE) / 2, y: p.gy * CELL + (CELL - ENEMY_SIZE) / 2, w: ENEMY_SIZE, h: ENEMY_SIZE };
    if (!isAreaFree(game, r)) continue;
    const fastCount = game.enemies.filter((e) => e.fast).length;
    const shouldBeFast = game.fastSpawned < TOTAL_FAST_ENEMIES && fastCount < ACTIVE_FAST_ENEMIES;
    game.enemies.push({ id: `enemy-${game.normalSpawned + 1}`, kind: "enemy", ...r, dir: p.dir, speed: shouldBeFast ? ENEMY_FAST_SPEED : ENEMY_SPEED, cooldown: shouldBeFast ? 0.52 + rand(game) * 0.38 : 0.8 + rand(game) * 0.7, aiTimer: 0.2, hp: ENEMY_MAX_HP, fast: shouldBeFast });
    if (shouldBeFast) game.fastSpawned++;
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
  game.boss = { id: "boss", kind: "boss", x: WORLD_W / 2 - BOSS_SIZE / 2, y: CELL * 1.25, w: BOSS_SIZE, h: BOSS_SIZE, dir: "down", speed: BOSS_SPEED, cooldown: 0.12, aiTimer: 0.08, hp: BOSS_MAX_HP, fast: true };
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
  const bw = vertical ? 8 : 17;
  const bh = vertical ? 17 : 8;
  let x = c.x - bw / 2;
  let y = c.y - bh / 2;
  if (tank.dir === "up") y = tank.y - bh - 2;
  if (tank.dir === "down") y = tank.y + tank.h + 2;
  if (tank.dir === "left") x = tank.x - bw - 2;
  if (tank.dir === "right") x = tank.x + tank.w + 2;
  game.bullets.push({ id: `b-${performance.now()}-${Math.random()}`, owner, sourceId: tank.id, x, y, w: bw, h: bh, dir: tank.dir, speed: owner === "player" ? 470 : tank.kind === "boss" ? 315 : 235 });
  tank.cooldown = owner === "player" ? 0.09 : tank.kind === "boss" ? 0.36 : 1.25;
  audio?.play("shoot");
}

function fireDroneBullet(game: Game, drone: Drone, target: Rect, audio?: ArcadeAudio | null) {
  if (drone.cooldown > 0) return;
  const c = centerOf(drone);
  const t = centerOf(target);
  const dx = t.x - c.x;
  const dy = t.y - c.y;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const dir: Dir = horizontal ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
  const vertical = dir === "up" || dir === "down";
  const bw = vertical ? 7 : 16;
  const bh = vertical ? 16 : 7;
  game.bullets.push({ id: `db-${performance.now()}-${Math.random()}`, owner: "drone", sourceId: drone.id, x: c.x - bw / 2, y: c.y - bh / 2, w: bw, h: bh, dir, speed: 650 });
  drone.cooldown = 0.16;
  audio?.play("spark");
}


function fireEnemyDroneBullet(game: Game, drone: Drone, target: Rect, audio?: ArcadeAudio | null) {
  if (drone.cooldown > 0 || !game.enemyDrone) return;
  const c = centerOf(drone);
  const t = centerOf(target);
  const dx = t.x - c.x;
  const dy = t.y - c.y;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const dir: Dir = horizontal ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
  const vertical = dir === "up" || dir === "down";
  const bw = vertical ? 7 : 16;
  const bh = vertical ? 16 : 7;
  game.bullets.push({ id: `edb-${performance.now()}-${Math.random()}`, owner: "enemy", sourceId: drone.id, x: c.x - bw / 2, y: c.y - bh / 2, w: bw, h: bh, dir, speed: 345 });
  game.enemyDroneAggroTimer = 3.8;
  drone.cooldown = 1.05;
  audio?.play("shoot");
}

function playerIsHiddenFrom(game: Game, tank: Tank) {
  if (!isInGrass(game, tankCollider(game.player))) return false;
  return distance(tank, game.player) > 170;
}

function lineClearToPlayer(game: Game, tank: Tank) {
  const a = centerOf(tank);
  const b = centerOf(game.player);
  const sameColumn = Math.abs(a.x - b.x) < CELL * 0.46;
  const sameRow = Math.abs(a.y - b.y) < CELL * 0.46;
  if (!sameColumn && !sameRow) return false;
  if (playerIsHiddenFrom(game, tank)) return false;
  const ray: Rect = sameColumn ? { x: a.x - 4, y: Math.min(a.y, b.y), w: 8, h: Math.abs(a.y - b.y) } : { x: Math.min(a.x, b.x), y: a.y - 4, w: Math.abs(a.x - b.x), h: 8 };
  return !game.walls.some((w) => rectsOverlap(ray, w));
}

function aimAtPlayer(game: Game, tank: Tank) {
  const a = centerOf(tank);
  const b = centerOf(game.player);
  if (Math.abs(a.x - b.x) < CELL * 0.46) { tank.dir = b.y < a.y ? "up" : "down"; return true; }
  if (Math.abs(a.y - b.y) < CELL * 0.46) { tank.dir = b.x < a.x ? "left" : "right"; return true; }
  return false;
}

function spawnPowerUp(game: Game) {
  const candidates: Rect[] = [
    { x: WORLD_W / 2 - 21, y: WORLD_H / 2 - 21, w: 42, h: 42 },
    { x: CELL * 3, y: CELL * 3, w: 42, h: 42 },
    { x: CELL * 13, y: CELL * 3, w: 42, h: 42 },
    { x: CELL * 3, y: CELL * 8, w: 42, h: 42 },
    { x: CELL * 13, y: CELL * 8, w: 42, h: 42 },
    { x: CELL * 8, y: CELL * 5, w: 42, h: 42 },
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

function damageEnemyTank(game: Game, enemy: Tank, amount: number, audio?: ArcadeAudio | null) {
  enemy.hp = Math.max(0, enemy.hp - amount);
  game.shake = Math.max(game.shake, 0.035);
  addExplosion(game, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 14);
  audio?.play("hit");
  if (enemy.hp <= 0) destroyEnemy(game, enemy.id, audio);
}

function destroyEnemyDrone(game: Game, audio?: ArcadeAudio | null) {
  if (!game.enemyDrone) return;
  const target = centerOf(game.enemyDrone);
  addExplosion(game, target.x, target.y, 92, 0.55);
  game.enemyDrone = null;
  game.enemyDroneHp = 0;
  game.enemyDroneDestroyed = true;
  game.message = "ENEMY DRONE DESTROYED";
  game.messageTimer = 1.8;
  game.shake = Math.max(game.shake, 0.4);
  audio?.play("boom");
}

function damageEnemyDrone(game: Game, amount: number, x: number, y: number, audio?: ArcadeAudio | null) {
  if (!game.enemyDrone) return;
  game.enemyDroneHp = Math.max(0, game.enemyDroneHp - amount);
  game.enemyDrone.spark = 0.22;
  game.shake = Math.max(game.shake, 0.04);
  addExplosion(game, x, y, 16);
  audio?.play("hit");
  if (game.enemyDroneHp <= 0) destroyEnemyDrone(game, audio);
}

function destroyEnemy(game: Game, enemyId: string, audio?: ArcadeAudio | null) {
  const enemy = game.enemies.find((e) => e.id === enemyId);
  if (!enemy) return;
  addExplosion(game, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 36);
  game.enemies = game.enemies.filter((e) => e.id !== enemyId);
  game.kills++;
  game.shake = 0.12;
  audio?.play("boom");
  if (!game.bossSpawned && game.kills >= game.nextPowerMilestone && game.kills < TARGET_KILLS) {
    spawnPowerUp(game);
    game.nextPowerMilestone += 3;
  }
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
  if (bulletOwner === "drone") return;
  wall.hp -= 1;
  addExplosion(game, wall.x + wall.w / 2, wall.y + wall.h / 2, 18);
  audio?.play("hit");
  if (wall.hp <= 0) {
    game.walls.splice(wallIndex, 1);
    addExplosion(game, wall.x + wall.w / 2, wall.y + wall.h / 2, 28);
  }
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
  return lane * 2.2 + d * 0.4;
}

function getThreatBullets(game: Game) {
  return game.bullets
    .filter((b) => b.owner === "enemy" && b.sourceId !== "enemy-drone" && !b.dead)
    .map((b) => ({ bullet: b, score: enemyBulletThreatScore(game, b) }))
    .filter((x) => x.score < 520)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.bullet);
}

function updateBullets(game: Game, dt: number, audio?: ArcadeAudio | null) {
  for (const bullet of game.bullets) {
    if (bullet.dead) continue;
    const v = dirVector(bullet.dir);
    const steps = Math.max(1, Math.ceil((bullet.speed * dt) / 8));
    const stepDt = dt / steps;
    for (let i = 0; i < steps; i++) {
      bullet.x += v.dx * bullet.speed * stepDt;
      bullet.y += v.dy * bullet.speed * stepDt;
      if (bullet.x < -20 || bullet.y < -20 || bullet.x > WORLD_W + 20 || bullet.y > WORLD_H + 20) { bullet.dead = true; break; }

      if (bullet.owner !== "drone") {
        const wallIndex = game.walls.findIndex((w) => rectsOverlap(bullet, w));
        if (wallIndex !== -1) { damageWall(game, wallIndex, bullet.owner, audio); bullet.dead = true; break; }
      }

      if (bullet.owner === "enemy") {
        if (bullet.sourceId !== "enemy-drone" && rectsOverlap(bullet, tankCollider(game.helper))) {
          bullet.dead = true;
          game.helper.cooldown = 0.18;
          addExplosion(game, bullet.x + bullet.w / 2, bullet.y + bullet.h / 2, 18);
          audio?.play("spark");
          break;
        }
        if (rectsOverlap(bullet, tankCollider(game.player))) { bullet.dead = true; damagePlayer(game, audio); break; }
      }

      if (bullet.owner === "drone") {
        if (game.enemyDrone && rectsOverlap(bullet, game.enemyDrone)) {
          bullet.dead = true;
          damageEnemyDrone(game, 1, bullet.x + bullet.w / 2, bullet.y + bullet.h / 2, audio);
          break;
        }
        const enemy = game.enemies.find((e) => rectsOverlap(bullet, tankCollider(e)));
        if (enemy) {
          bullet.dead = true;
          damageEnemyTank(game, enemy, 1, audio);
          break;
        }
      }

      if (bullet.owner === "player") {
        if (game.enemyDrone && rectsOverlap(bullet, game.enemyDrone)) {
          bullet.dead = true;
          damageEnemyDrone(game, 1, bullet.x + bullet.w / 2, bullet.y + bullet.h / 2, audio);
          break;
        }
        const enemy = game.enemies.find((e) => rectsOverlap(bullet, tankCollider(e)));
        if (enemy) { bullet.dead = true; damageEnemyTank(game, enemy, 1, audio); break; }
      }
    }
  }

  for (let i = 0; i < game.bullets.length; i++) {
    const a = game.bullets[i];
    if (a.dead) continue;
    for (let j = i + 1; j < game.bullets.length; j++) {
      const b = game.bullets[j];
      if (b.dead) continue;
      const neutralizes = (a.owner === "enemy" && (b.owner === "player" || b.owner === "drone")) || (b.owner === "enemy" && (a.owner === "player" || a.owner === "drone"));
      if (neutralizes && rectsOverlap(a, b)) {
        a.dead = true;
        b.dead = true;
        addExplosion(game, (a.x + b.x) / 2, (a.y + b.y) / 2, 16);
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
    if (lineClearToPlayer(game, enemy) && aimAtPlayer(game, enemy)) fireBullet(game, enemy, "enemy", audio);
    if (enemy.aiTimer <= 0) {
      enemy.aiTimer = 0.45 + rand(game) * 0.95;
      const c = centerOf(enemy);
      const p = centerOf(game.player);
      const preferHorizontal = Math.abs(p.x - c.x) > Math.abs(p.y - c.y);
      if (rand(game) < 0.5 && !playerIsHiddenFrom(game, enemy)) enemy.dir = preferHorizontal ? (p.x < c.x ? "left" : "right") : p.y < c.y ? "up" : "down";
      else enemy.dir = DIRS[Math.floor(rand(game) * DIRS.length)];
    }
    const moved = moveTank(game, enemy, dt);
    if (!moved) { enemy.dir = DIRS[Math.floor(rand(game) * DIRS.length)]; enemy.aiTimer = 0.12; }
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
    boss.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
  }
  const moved = moveTank(game, boss, dt);
  if (!moved) boss.dir = Math.abs(p.x - c.x) > Math.abs(p.y - c.y) ? (p.y < c.y ? "up" : "down") : p.x < c.x ? "left" : "right";
}

function updatePlayer(game: Game, input: InputState, dt: number, audio?: ArcadeAudio | null) {
  game.player.speed = game.speedBoostTimer > 0 ? PLAYER_BOOST_SPEED : PLAYER_BASE_SPEED;
  game.player.cooldown = Math.max(0, game.player.cooldown - dt);
  let dir: Dir | null = null;
  if (input.up) dir = "up";
  else if (input.down) dir = "down";
  else if (input.left) dir = "left";
  else if (input.right) dir = "right";
  if (dir) { game.player.dir = dir; moveTank(game, game.player, dt); }
  if (input.fire) fireBullet(game, game.player, "player", audio);
  for (const power of game.powerUps) {
    if (rectsOverlap(tankCollider(game.player), power)) {
      game.speedBoostTimer = Math.max(game.speedBoostTimer, 8);
      game.powerUps = [];
      game.message = "SPEED BOOST ACTIVE";
      game.messageTimer = 1.5;
      audio?.play("power");
      break;
    }
  }
}

function nearestDroneAttackTarget(game: Game, drone: Drone, reservedTargets: Set<string>): Tank | null {
  const priorityGroups = [
    game.enemies.filter((enemy) => enemy.fast && !reservedTargets.has(enemy.id)),
    game.enemies.filter((enemy) => !enemy.fast && !reservedTargets.has(enemy.id)),
  ];

  for (const group of priorityGroups) {
    let best: Tank | null = null;
    let bestDistance = Infinity;
    for (const enemy of group) {
      const d = distance(drone, enemy);
      if (d < bestDistance) {
        best = enemy;
        bestDistance = d;
      }
    }
    if (best) return best;
  }

  return null;
}

function updateHelperTank(game: Game, dt: number, audio?: ArcadeAudio | null) {
  const helper = game.helper;
  helper.cooldown = Math.max(0, helper.cooldown - dt);
  const threats = getThreatBullets(game);
  const pc = centerOf(game.player);
  const targetBullet = threats[0];

  if (targetBullet) {
    const t = centerOf(targetBullet);
    const h = centerOf(helper);
    helper.dir = Math.abs(t.x - h.x) > Math.abs(t.y - h.y) ? (t.x < h.x ? "left" : "right") : t.y < h.y ? "up" : "down";
    moveTank(game, helper, dt);
    if (distance(helper, targetBullet) < 48) {
      targetBullet.dead = true;
      helper.cooldown = 0.22;
      addExplosion(game, t.x, t.y, 20);
      audio?.play("spark");
    }
    return;
  }

  const guardX = pc.x - 95;
  const guardY = pc.y + 76;
  const hc = centerOf(helper);
  const dx = guardX - hc.x;
  const dy = guardY - hc.y;
  if (Math.hypot(dx, dy) > 26) {
    helper.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
    moveTank(game, helper, dt * 0.7);
  }
}

function updateDrones(game: Game, dt: number, audio?: ArcadeAudio | null) {
  for (const d of game.friendlyDrones) {
    d.cooldown = Math.max(0, d.cooldown - dt);
    d.spark = Math.max(0, d.spark - dt);
  }
  if (game.enemyDrone) {
    game.enemyDrone.cooldown = Math.max(0, game.enemyDrone.cooldown - dt);
    game.enemyDrone.spark = Math.max(0, game.enemyDrone.spark - dt);
  }

  const pc = centerOf(game.player);

  if (game.enemyDrone) {
    const red = game.enemyDrone;
    const nearestFriendly = game.friendlyDrones.reduce((best, d) => distance(d, red) < distance(best, red) ? d : best, game.friendlyDrones[0]);
    const dronePressure = nearestFriendly && distance(red, nearestFriendly) < 290;
    if (dronePressure) {
      const fc = centerOf(nearestFriendly);
      moveDroneToward(red, fc.x, fc.y, dt, 0.5);
      if (distance(red, nearestFriendly) < 385) fireEnemyDroneBullet(game, red, nearestFriendly, audio);
    } else {
      moveDroneToward(red, pc.x, pc.y, dt, 0.38);
      if (distance(red, game.player) < 455) fireEnemyDroneBullet(game, red, game.player, audio);
    }
  }

  const reservedTargets = new Set<string>();

  for (let i = 0; i < game.friendlyDrones.length; i++) {
    const drone = game.friendlyDrones[i];
    const attackTarget = nearestDroneAttackTarget(game, drone, reservedTargets);

    if (attackTarget) {
      reservedTargets.add(attackTarget.id);
      const tc = centerOf(attackTarget);
      const sideOffset = i === 0 ? -56 : 56;
      const chaseSlow = attackTarget.fast ? 0.95 : 0.82;
      moveDroneToward(drone, tc.x + sideOffset, tc.y - 48, dt, chaseSlow);
      if (distance(drone, attackTarget) < 500) fireDroneBullet(game, drone, attackTarget, audio);
      continue;
    }

    if (game.enemyDrone && game.enemyDroneAggroTimer > 0) {
      const ec = centerOf(game.enemyDrone);
      const ring = i === 0 ? -58 : 58;
      moveDroneToward(drone, ec.x + ring, ec.y - 32, dt, 0.92);
      if (distance(drone, game.enemyDrone) < 470) fireDroneBullet(game, drone, game.enemyDrone, audio);
      if (distance(drone, game.enemyDrone) < 46) {
        drone.spark = 0.22;
        game.enemyDrone.spark = 0.22;
        damageEnemyDrone(game, 1, ec.x, ec.y, audio);
      }
      continue;
    }

    const guardX = pc.x + (i === 0 ? -104 : 104);
    const guardY = pc.y + 60;
    moveDroneToward(drone, guardX, guardY, dt, 0.7);
  }
}

function launchMissile(game: Game, audio?: ArcadeAudio | null) {
  if (game.missileLaunched || !game.enemyDrone) return;
  game.missileLaunched = true;
  game.message = "MISSILE LAUNCHED";
  game.messageTimer = 1.5;
  const t = centerOf(game.enemyDrone);
  game.missile = { active: true, x: t.x, y: -50, vx: 0, vy: 1, speed: 720 };
  audio?.play("missile");
}

function updateMissile(game: Game, dt: number, audio?: ArcadeAudio | null) {
  if (!game.missile || !game.enemyDrone) return;
  const m = game.missile;
  const target = centerOf(game.enemyDrone);
  const dx = target.x - m.x;
  const dy = target.y - m.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  m.vx = dx / d;
  m.vy = dy / d;
  const step = Math.min(d, m.speed * dt);
  m.x += m.vx * step;
  m.y += m.vy * step;
  if (d < 24) {
    addExplosion(game, target.x, target.y, 120, 0.7);
    game.enemyDrone = null;
    game.enemyDroneDestroyed = true;
    game.missile = null;
    game.bossDelay = 1.2;
    game.message = "ENEMY DRONE DESTROYED";
    game.messageTimer = 1.8;
    game.shake = 0.55;
    audio?.play("boom");
  }
}

function updateGame(game: Game, input: InputState, dt: number, audio?: ArcadeAudio | null) {
  if (game.status !== "playing") return;
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt);
  game.playerInvincible = Math.max(0, game.playerInvincible - dt);
  game.messageTimer = Math.max(0, game.messageTimer - dt);
  game.speedBoostTimer = Math.max(0, game.speedBoostTimer - dt);
  game.enemyDroneAggroTimer = Math.max(0, game.enemyDroneAggroTimer - dt);

  updatePlayer(game, input, dt, audio);
  updateEnemies(game, dt, audio);
  updateBoss(game, dt, audio);
  updateDrones(game, dt, audio);
  updateHelperTank(game, dt, audio);
  updateBullets(game, dt, audio);
  updateMissile(game, dt, audio);

  for (const p of game.powerUps) p.life -= dt;
  game.powerUps = game.powerUps.filter((p) => p.life > 0);
  for (const e of game.explosions) e.t += dt;
  game.explosions = game.explosions.filter((e) => e.t < e.life);

  if (game.kills >= TARGET_KILLS && game.normalSpawned >= TARGET_KILLS) {
    if (game.enemies.length === 0 && !game.enemyDrone) {
      game.status = "victory";
      game.message = "VICTORY";
      game.messageTimer = 4;
      audio?.play("win");
    }
  } else {
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
    for (let y = terrain.y + 5; y < terrain.y + terrain.h; y += 10) {
      for (let x = terrain.x + 3; x < terrain.x + terrain.w; x += 12) {
        const sway = Math.sin(time * 3 + x * 0.1 + y * 0.08) * 2;
        ctx.fillRect(x + sway, y, 3, 8);
      }
    }
    return;
  }
  ctx.fillStyle = "rgba(14, 116, 144, 0.86)";
  ctx.fillRect(terrain.x, terrain.y, terrain.w, terrain.h);
  ctx.fillStyle = "rgba(165, 243, 252, 0.45)";
  for (let y = terrain.y + 8; y < terrain.y + terrain.h; y += 14) {
    for (let x = terrain.x + 8; x < terrain.x + terrain.w; x += 26) {
      const wave = Math.sin(time * 4 + x * 0.08) * 3;
      ctx.fillRect(x + wave, y, 16, 3);
    }
  }
}

function drawBrick(ctx: CanvasRenderingContext2D, w: Wall) {
  ctx.fillStyle = "#b92d10";
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = "#ef6427";
  ctx.fillRect(w.x + 3, w.y + 3, w.w - 6, 5);
  ctx.fillRect(w.x + 3, w.y + 19, w.w - 6, 5);
  ctx.fillRect(w.x + 3, w.y + 35, w.w - 6, 5);
  ctx.fillStyle = "#66737d";
  ctx.fillRect(w.x, w.y + 13, w.w, 3);
  ctx.fillRect(w.x, w.y + 29, w.w, 3);
  ctx.fillRect(w.x + 20, w.y, 3, 14);
  ctx.fillRect(w.x + 10, w.y + 16, 3, 14);
  ctx.fillRect(w.x + 31, w.y + 32, 3, 12);
}

function drawStone(ctx: CanvasRenderingContext2D, w: Wall) {
  const ratio = w.hp / w.maxHp;
  ctx.fillStyle = ratio > 0.5 ? "#a3a8ad" : "#858c94";
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = "#dadde0";
  ctx.fillRect(w.x + 4, w.y + 4, 14, 14);
  ctx.fillRect(w.x + 25, w.y + 5, 13, 13);
  ctx.fillRect(w.x + 5, w.y + 27, 15, 12);
  ctx.fillRect(w.x + 26, w.y + 25, 12, 14);
  ctx.fillStyle = "#5f676f";
  ctx.fillRect(w.x, w.y + 20, w.w, 3);
  ctx.fillRect(w.x + 20, w.y, 3, w.h);
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
  ctx.strokeRect(w.x + 4, w.y + 4, w.w - 8, w.h - 8);
  ctx.fillStyle = "#434b52";
  ctx.fillRect(w.x + 10, w.y + 10, 6, 6);
  ctx.fillRect(w.x + 29, w.y + 10, 6, 6);
  ctx.fillRect(w.x + 10, w.y + 29, 6, 6);
  ctx.fillRect(w.x + 29, w.y + 29, 6, 6);
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function fillRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawTank(ctx: CanvasRenderingContext2D, game: Game, tank: Tank, invincible = false) {
  if (invincible && Math.floor(performance.now() / 90) % 2 === 0) return;
  const inGrass = isInGrass(game, tankCollider(tank));
  if (inGrass) ctx.globalAlpha = 0.62;

  const angle = tank.dir === "up" ? 0 : tank.dir === "right" ? Math.PI / 2 : tank.dir === "down" ? Math.PI : -Math.PI / 2;
  const cx = tank.x + tank.w / 2;
  const cy = tank.y + tank.h / 2;
  const w = tank.w;
  const h = tank.h;

  let body = "#f2b705";
  let body2 = "#ffd866";
  let tread = "#6b4213";
  let stroke = "#fff2a8";
  let lens = "#fff7cf";

  if (tank.kind === "enemy") {
    body = "#f8fafc";
    body2 = tank.fast ? "#ffffff" : "#e2e8f0";
    tread = "#475569";
    stroke = tank.fast ? "#f59e0b" : "#cbd5e1";
    lens = tank.fast ? "#fb923c" : "#94a3b8";
  }
  if (tank.kind === "helper") {
    body = "#38bdf8";
    body2 = "#dff7ff";
    tread = "#075985";
    stroke = "#e0f2fe";
    lens = "#ecfeff";
  }
  if (tank.kind === "boss") {
    body = "#e5314f";
    body2 = "#ff9aad";
    tread = "#4a0c18";
    stroke = "#fecdd3";
    lens = "#fee2e2";
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  ctx.shadowColor = tank.kind === "player" ? "rgba(250,204,21,0.3)" : tank.fast ? "rgba(251,146,60,0.24)" : "rgba(0,0,0,0.25)";
  ctx.shadowBlur = tank.kind === "player" || tank.fast ? 12 : 6;

  fillRoundedRect(ctx, -w * 0.5, -h * 0.42, w * 0.22, h * 0.84, 6, tread);
  fillRoundedRect(ctx, w * 0.28, -h * 0.42, w * 0.22, h * 0.84, 6, tread);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(15,23,42,0.88)";
  for (let y = -h * 0.34; y <= h * 0.32; y += h * 0.18) {
    fillRoundedRect(ctx, -w * 0.47, y, w * 0.16, h * 0.055, 3, "rgba(15,23,42,0.9)");
    fillRoundedRect(ctx, w * 0.31, y, w * 0.16, h * 0.055, 3, "rgba(15,23,42,0.9)");
  }

  const gradient = ctx.createLinearGradient(0, -h * 0.42, 0, h * 0.42);
  gradient.addColorStop(0, body2);
  gradient.addColorStop(0.54, body);
  gradient.addColorStop(1, tank.kind === "enemy" ? "#cbd5e1" : body);
  roundedRectPath(ctx, -w * 0.31, -h * 0.45, w * 0.62, h * 0.9, 10);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  fillRoundedRect(ctx, -w * 0.095, -h * 0.71, w * 0.19, h * 0.47, 4, body);
  fillRoundedRect(ctx, -w * 0.065, -h * 0.82, w * 0.13, h * 0.18, 3, stroke);

  ctx.beginPath();
  ctx.arc(0, -h * 0.03, w * 0.19, 0, Math.PI * 2);
  ctx.fillStyle = body2;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-w * 0.17, h * 0.18);
  ctx.lineTo(0, h * 0.31);
  ctx.lineTo(w * 0.17, h * 0.18);
  ctx.strokeStyle = tank.kind === "enemy" ? "rgba(71,85,105,0.7)" : "rgba(0,0,0,0.32)";
  ctx.lineWidth = 3;
  ctx.stroke();

  if (tank.fast) {
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(-w * 0.26, -h * 0.22);
    ctx.lineTo(w * 0.1, -h * 0.22);
    ctx.lineTo(-w * 0.04, h * 0.02);
    ctx.lineTo(w * 0.25, h * 0.02);
    ctx.lineTo(-w * 0.1, h * 0.26);
    ctx.lineTo(w * 0.02, h * 0.07);
    ctx.lineTo(-w * 0.25, h * 0.07);
    ctx.closePath();
    ctx.fill();
  }

  if (tank.kind === "helper") {
    ctx.strokeStyle = "#e0f2fe";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -1, w * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#0ea5e9";
    ctx.fillRect(-w * 0.18, h * 0.31, w * 0.36, 4);
  }

  ctx.fillStyle = lens;
  ctx.beginPath();
  ctx.arc(-w * 0.17, -h * 0.29, Math.max(3, w * 0.055), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawDrone(ctx: CanvasRenderingContext2D, drone: Drone) {
  const cx = drone.x + drone.w / 2;
  const cy = drone.y + drone.h / 2;
  const r = drone.w / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(drone.angle);

  const isFriendly = drone.team === "friendly";
  ctx.fillStyle = isFriendly ? "#1d4ed8" : "#991b1b";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isFriendly ? "#bfdbfe" : "#ef4444";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isFriendly ? "#eff6ff" : "#fee2e2";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isFriendly ? "rgba(191,219,254,0.9)" : "rgba(254,202,202,0.95)";
  ctx.lineWidth = Math.max(3, r * 0.14);
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.15, 0.4, Math.PI * 1.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.15, Math.PI + 0.4, Math.PI * 2.35);
  ctx.stroke();

  if (drone.spark > 0) {
    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMissile(ctx: CanvasRenderingContext2D, missile: Missile) {
  const angle = Math.atan2(missile.vy, missile.vx) + Math.PI / 2;
  ctx.save();
  ctx.translate(missile.x, missile.y);
  ctx.rotate(angle);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(-5, -22, 10, 34);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(-6, -24, 12, 8);
  ctx.fillStyle = "#f97316";
  ctx.fillRect(-7, 12, 14, 16);
  ctx.fillStyle = "#facc15";
  ctx.fillRect(-4, 18, 8, 18);
  ctx.restore();
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
  const safeTop = small ? 92 : 84;
  const safeBottom = portrait ? 200 : small ? 132 : 58;
  const availableW = cssW;
  const availableH = Math.max(160, cssH - safeTop - safeBottom);
  const fitScale = Math.min(availableW / WORLD_W, availableH / WORLD_H);
  const readableScale = portrait ? 0.62 : small ? 0.82 : 1;
  const scale = Math.max(fitScale, readableScale);
  const viewportW = availableW / scale;
  const viewportH = availableH / scale;
  const pc = centerOf(game.player);
  const cameraX = viewportW >= WORLD_W ? -(viewportW - WORLD_W) / 2 : clamp(pc.x - viewportW / 2, 0, WORLD_W - viewportW);
  const cameraY = viewportH >= WORLD_H ? -(viewportH - WORLD_H) / 2 : clamp(pc.y - viewportH / 2, 0, WORLD_H - viewportH);
  const ox = -cameraX * scale;
  const oy = safeTop - cameraY * scale;
  const shakeX = game.shake > 0 ? Math.sin(game.time * 80) * game.shake * 16 : 0;
  const shakeY = game.shake > 0 ? Math.cos(game.time * 70) * game.shake * 12 : 0;

  ctx.fillStyle = "#020403";
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, safeTop, cssW, availableH);
  ctx.clip();
  ctx.translate(ox + shakeX, oy + shakeY);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#020403";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = "rgba(255,255,255,0.032)";
  drawBlockText(ctx, "SHRIMO", 145, 292, 13, 1);
  drawBlockText(ctx, "INNOVATIONS", 135, 402, 10, 1);

  for (const terrain of game.terrain) drawTerrain(ctx, terrain, game.time);

  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD_W; x += CELL) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke(); }
  for (let y = 0; y <= WORLD_H; y += CELL) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke(); }

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
    ctx.fillRect(p.x + p.w * 0.38, p.y + p.h * 0.12, p.w * 0.24, p.h * 0.28);
    ctx.fillRect(p.x + p.w * 0.30, p.y + p.h * 0.38, p.w * 0.24, p.h * 0.28);
    ctx.fillRect(p.x + p.w * 0.46, p.y + p.h * 0.60, p.w * 0.24, p.h * 0.28);
    ctx.globalAlpha = 1;
  }

  drawTank(ctx, game, game.helper);
  drawTank(ctx, game, game.player, game.playerInvincible > 0);
  for (const enemy of game.enemies) drawTank(ctx, game, enemy);
  if (game.boss) drawTank(ctx, game, game.boss);

  for (const b of game.bullets) {
    ctx.fillStyle = b.owner === "player" ? "#ffd35a" : b.owner === "drone" ? "#bfdbfe" : "#67e8f9";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(b.x + 1, b.y + 1, Math.max(2, b.w - 2), Math.max(2, b.h - 2));
  }

  for (const drone of game.friendlyDrones) drawDrone(ctx, drone);
  if (game.enemyDrone) drawDrone(ctx, game.enemyDrone);
  if (game.missile) drawMissile(ctx, game.missile);

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
    ctx.fillRect(WORLD_W / 2 - 230, WORLD_H / 2 - 42, 460, 84);
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 3;
    ctx.strokeRect(WORLD_W / 2 - 230, WORLD_H / 2 - 42, 460, 84);
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
    active: game.enemies.length,
    bossHp: game.bossHp,
    bossSpawned: game.bossSpawned,
    muted: game.muted,
    boost: game.speedBoostTimer,
    drones: game.friendlyDrones.length,
    helper: "Online",
    fastActive: game.enemies.filter((enemy) => enemy.fast).length,
    enemyDroneMode: game.enemyDroneAggroTimer > 0 ? "Attacking" : "Patrolling",
    enemyDrone: game.enemyDrone ? "Active" : game.enemyDroneDestroyed ? "Destroyed" : "Offline",
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
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaChallenge>(() => createCaptchaChallenge());
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaError, setCaptchaError] = useState("");

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

  const refreshCaptcha = useCallback(() => {
    setCaptcha(createCaptchaChallenge());
    setCaptchaAnswer("");
    setCaptchaError("");
  }, []);

  const verifyCaptcha = useCallback(() => {
    const value = Number(captchaAnswer.trim());
    if (Number.isFinite(value) && value === captcha.answer) {
      setCaptchaVerified(true);
      setCaptchaError("");
      ensureAudio().play("start");
      return;
    }
    setCaptchaVerified(false);
    setCaptchaError("Wrong answer. Ask a parent/guardian or solve again.");
    refreshCaptcha();
  }, [captcha.answer, captchaAnswer, ensureAudio, refreshCaptcha]);

  const startGame = useCallback(() => {
    if (!captchaVerified) {
      setCaptchaError("Solve the math check first to unlock the game.");
      return;
    }
    const audio = ensureAudio();
    const game = createGame("playing", mutedRef.current);
    spawnNormalEnemies(game);
    gameRef.current = game;
    keyboardRef.current = copyInput(EMPTY_INPUT);
    touchRef.current = copyInput(EMPTY_INPUT);
    setHud(snapshot(game));
    audio.play("start");
  }, [captchaVerified, ensureAudio]);

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
      if (document.exitFullscreen) document.exitFullscreen(); else doc.webkitExitFullscreen?.();
    } else {
      if (root.requestFullscreen) root.requestFullscreen(); else root.webkitRequestFullscreen?.();
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
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => { e.preventDefault(); setTouch(key, false); },
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
      const useful = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "Space", "Enter", "NumpadEnter", "KeyP", "KeyM", "KeyF", "Escape", "Backspace", "MediaPlayPause", "BrowserBack", "GoBack"];
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
      if (!pad) { gamepadRef.current = next; return; }
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
      if (now - lastHud > 90) { setHud(snapshot(gameRef.current)); lastHud = now; }
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
          <span>Kills: {hud.kills}/20</span>
          <span>Enemy Tanks: {hud.active}/6</span>
          <span className="assistantOk">Drones: {hud.drones}</span>
          <span className="boost">Fast Tanks: {hud.fastActive}/4</span>
          <span className="helperOk">Helper Tank: {hud.helper}</span>
          <span className={hud.enemyDrone === "Active" ? "enemyDrone" : "assistantDown"}>Enemy Drone: {hud.enemyDrone}{hud.enemyDrone === "Active" ? ` · ${hud.enemyDroneMode}` : ""}</span>
          {hud.boost > 0 && <span className="boost">Boost: {hud.boost.toFixed(1)}s</span>}
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

      <section className="help">Desktop: WASD/Arrows + Space · Mobile: D-pad + Fire · Drones split targets: fast tanks first, tanks next, red drone only after it attacks · Helper blocks enemy tank bullets · Fullscreen: F</section>
      <section className="rotateHint">Rotate for best gameplay</section>

      {!loaderReady && (
        <section className="overlay loaderOverlay" aria-label="Loading and policies">
          <div className="panel loaderPanel">
            <p className="eyebrow">Loading Game</p>
            <h1>TANKAR</h1>
            <p>Loading the larger battlefield, circular drones, helper tank, readable walls, controls, and safety information.</p>
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
            <p className="legalNote">Free skill-based arcade game. No gambling, no real-money reward, no purchase required.</p>
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
                <p>Destroy 20 white enemy tanks, protect the golden tank, and let 2 circular drones split targets. They hunt fast tanks first, normal tanks next, and only attack the red drone after it fires.</p>
                {!captchaVerified ? (
                  <div className="captchaBox" role="group" aria-label="Math access check">
                    <strong>Math Access Check</strong>
                    <span className="captchaQuestion">{captcha.question} = ?</span>
                    <input
                      value={captchaAnswer}
                      onChange={(e) => setCaptchaAnswer(e.target.value.replace(/[^0-9-]/g, ""))}
                      onKeyDown={(e) => { if (e.key === "Enter") verifyCaptcha(); }}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Enter answer"
                      autoFocus
                    />
                    {captchaError && <small className="captchaError">{captchaError}</small>}
                    <div className="captchaActions">
                      <button className="primary smallPrimary" onClick={verifyCaptcha}>Unlock Game</button>
                      <button className="mini lightMini" onClick={refreshCaptcha}>New Question</button>
                    </div>
                    <small className="captchaNote">Includes addition, subtraction, multiplication and division. This is a simple access check, not a legal age verification.</small>
                  </div>
                ) : (
                  <>
                    <p className="unlockOk">Math check passed. Game unlocked.</p>
                    <button className="primary" onClick={startGame} autoFocus>Start Game</button>
                  </>
                )}
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
                <p>You destroyed 20 enemy tanks and cleared the red enemy drone.</p>
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
          background: radial-gradient(circle at 50% 20%, rgba(255, 195, 67, 0.12), transparent 30%), radial-gradient(circle at 70% 70%, rgba(103, 232, 249, 0.08), transparent 35%), #020403;
        }
        canvas { position: absolute; inset: 0; width: 100vw; height: 100vh; image-rendering: pixelated; }
        .hud {
          position: absolute; z-index: 5; top: max(12px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
          width: min(1220px, calc(100vw - 24px)); min-height: 62px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 12px 10px 16px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(8, 12, 15, 0.82); backdrop-filter: blur(14px); box-shadow: 0 18px 60px rgba(0,0,0,0.45);
        }
        .brand { display: flex; align-items: center; gap: 10px; font-weight: 900; letter-spacing: 0.18em; text-shadow: 2px 2px 0 #7f1d1d; white-space: nowrap; }
        .dot { width: 12px; height: 12px; background: #facc15; box-shadow: 0 0 0 4px rgba(250,204,21,0.18); }
        .stats { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 7px; font-size: 12px; }
        .stats span { padding: 7px 9px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.9); }
        .stats .boss { color: #fecdd3; border-color: rgba(248,113,113,0.45); background: rgba(127,29,29,0.45); }
        .stats .boost { color: #dbeafe; border-color: rgba(96,165,250,0.45); background: rgba(30,64,175,0.45); }
        .stats .assistantOk { color: #bbf7d0; border-color: rgba(74,222,128,0.38); background: rgba(20,83,45,0.48); }
        .stats .helperOk { color: #bae6fd; border-color: rgba(56,189,248,0.42); background: rgba(7,89,133,0.48); }
        .stats .assistantDown { color: #fed7aa; border-color: rgba(251,146,60,0.38); background: rgba(124,45,18,0.48); }
        .stats .enemyDrone { color: #fecdd3; border-color: rgba(244,63,94,0.42); background: rgba(127,29,29,0.48); }
        .actions { display: flex; gap: 8px; }
        .actions button, .primary, .mini, .pad, .fire { border: 0; color: #07100b; background: #facc15; cursor: pointer; box-shadow: inset 0 -3px 0 rgba(0,0,0,0.22); transition: transform 140ms ease, filter 140ms ease; }
        .actions button { padding: 10px 12px; }
        .actions button:hover, .primary:hover, .mini:hover, .pad:hover, .fire:hover { transform: translateY(-1px); filter: brightness(1.08); }
        .help {
          position: absolute; z-index: 4; left: 50%; bottom: max(12px, env(safe-area-inset-bottom)); transform: translateX(-50%); width: min(1120px, calc(100vw - 24px)); padding: 9px 12px; text-align: center; font-size: 11px;
          line-height: 1.45; color: rgba(255,255,255,0.72); border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.52); backdrop-filter: blur(10px);
        }
        .touchControls { position: absolute; z-index: 6; inset: auto 0 max(44px, calc(env(safe-area-inset-bottom) + 42px)) 0; display: none; justify-content: space-between; align-items: flex-end; pointer-events: none; padding: 0 18px; }
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
        .rotateHint { display: none; position: absolute; z-index: 7; right: 14px; top: 104px; padding: 8px 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.58); color: rgba(255,255,255,0.76); font-size: 11px; }
        .overlay { position: absolute; z-index: 10; inset: 0; display: grid; place-items: center; padding: 24px; background: linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.72)), repeating-linear-gradient(0deg, rgba(255,255,255,0.035), rgba(255,255,255,0.035) 1px, transparent 1px, transparent 5px); }
        .panel { width: min(590px, 100%); padding: 34px; text-align: center; border: 1px solid rgba(250,204,21,0.45); background: rgba(5,8,11,0.9); box-shadow: 0 30px 90px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08); }
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

        .captchaBox {
          margin: 18px auto 18px; width: min(430px, 100%); padding: 18px; display: grid; gap: 12px;
          border: 1px solid rgba(250,204,21,0.34); background: rgba(255,255,255,0.055); text-align: center;
        }
        .captchaBox strong { color: #facc15; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; }
        .captchaQuestion { font-size: clamp(26px, 6vw, 42px); font-weight: 900; color: #fff; text-shadow: 3px 3px 0 #7f1d1d; }
        .captchaBox input {
          width: 100%; min-height: 54px; border: 1px solid rgba(255,255,255,0.18); background: rgba(0,0,0,0.48); color: #fff;
          padding: 12px 14px; font: inherit; font-size: 22px; text-align: center; outline: none;
        }
        .captchaBox input:focus { border-color: #facc15; box-shadow: 0 0 0 4px rgba(250,204,21,0.18); }
        .captchaError { color: #fecaca; line-height: 1.45; }
        .captchaNote { color: rgba(255,255,255,0.6); line-height: 1.5; }
        .captchaActions { display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap; }
        .smallPrimary { min-width: 150px; min-height: 48px; font-size: 12px; }
        .lightMini { background: rgba(255,255,255,0.86); color: #07100b; }
        .unlockOk { color: #bbf7d0 !important; font-weight: 800; margin-bottom: 14px !important; }

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
        @media (min-width: 1200px) and (min-height: 680px) { .stats { font-size: 13px; } .hud { min-height: 60px; } }
      `}</style>
    </main>
  );
}
