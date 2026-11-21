import { FACTIONS } from '../data/factions';
import type { BuildingDef } from '../data/types';
import * as L from '../sim/layout';
import { ATTACK_COLORS, drawBuildingIcon, drawUnitShape } from './shapes';
import { BLOOM_TIME, MAX_RANK, type Building, type SimEvent, type World } from '../sim/world';

export const TEAM_COLORS = ['#4aa3ff', '#ff5a5a'];

interface Fx {
  kind: 'shot' | 'splash' | 'death' | 'text' | 'root' | 'rank' | 'gale';
  t0: number;
  life: number;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r?: number;
  color: string;
  text?: string;
}

export interface ViewState {
  humanId: number;
  hover: { col: number; row: number } | null;
  buildDef: BuildingDef | null;
  selected: Building | null;
  /** tutorial: pulse an outline around this area */
  highlight?: { x: number; y: number; w: number; h: number } | null;
}

/** Gray-box renderer: reads the world, never changes it. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private fx: Fx[] = [];
  private scale = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(cssScale: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.scale = cssScale * dpr;
    this.canvas.width = Math.round(L.W * this.scale);
    this.canvas.height = Math.round(L.H * this.scale);
  }

  clearFx() {
    this.fx = [];
  }

  ingest(events: SimEvent[], humanId: number, now: number) {
    if (this.fx.length > 600) this.fx.splice(0, this.fx.length - 600);
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          this.fx.push({ kind: 'shot', t0: now, life: 0.12, x: e.x1, y: e.y1, x2: e.x2, y2: e.y2, color: ATTACK_COLORS[e.attack] });
          break;
        case 'splash':
          this.fx.push({ kind: 'splash', t0: now, life: 0.3, x: e.x, y: e.y, r: e.r, color: '#ffb36b' });
          break;
        case 'death':
          this.fx.push({ kind: 'death', t0: now, life: e.big ? 0.6 : 0.35, x: e.x, y: e.y, r: e.big ? 28 : 12, color: TEAM_COLORS[e.team] });
          break;
        case 'bounty':
          if (e.owner === humanId && e.amount > 0) this.fx.push({ kind: 'text', t0: now, life: 0.9, x: e.x, y: e.y - 10, color: '#ffd84a', text: `+${e.amount}` });
          break;
        case 'root':
          this.fx.push({ kind: 'root', t0: now, life: 0.6, x: e.x, y: e.y, r: e.r, color: '#9be36b' });
          break;
        case 'rank':
          this.fx.push({ kind: 'rank', t0: now, life: 1.0, x: e.x, y: e.y - 22, color: e.bloom ? '#9be36b' : '#ffffff', text: e.bloom ? 'Bloom!' : 'Rank up' });
          break;
        case 'gale':
          this.fx.push({ kind: 'gale', t0: now, life: 0.8, x: e.team === 0 ? 1 : -1, y: 0, color: '#e8fbff' });
          break;
        case 'heal':
          this.fx.push({ kind: 'text', t0: now, life: 0.6, x: e.x, y: e.y - 8, color: '#7dff8a', text: '+' });
          break;
        case 'silence':
          this.fx.push({ kind: 'root', t0: now, life: 0.7, x: e.x, y: e.y, r: e.r, color: '#c08cff' });
          break;
        case 'echo':
          this.fx.push({ kind: 'root', t0: now, life: 0.6, x: e.x, y: e.y, r: 22, color: '#a8ffe0' });
          break;
        case 'stun':
          this.fx.push({ kind: 'root', t0: now, life: 0.5, x: e.x, y: e.y, r: 16, color: '#ffe066' });
          break;
      }
    }
  }

  draw(w: World, v: ViewState, now: number) {
    const c = this.ctx;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.drawBackground(w, v);
    for (const b of w.buildings) this.drawBuilding(w, b, v, now);
    this.drawPlacement(w, v);
    if (v.highlight) {
      const h = v.highlight;
      c.strokeStyle = `rgba(255, 216, 74, ${0.55 + 0.45 * Math.sin(now * 6)})`;
      c.lineWidth = 3;
      c.strokeRect(h.x - 4, h.y - 4, h.w + 8, h.h + 8);
    }
    for (const core of w.cores) this.drawCore(core.team, core.x, core.y, core.hp / core.maxHp, core.alive);
    // ground first, then flyers on top
    for (const u of w.units) if (!u.flying) this.drawUnit(u, now);
    for (const u of w.units) if (u.flying) this.drawUnit(u, now);
    this.drawFx(now);
  }

  private drawBackground(w: World, v: ViewState) {
    const c = this.ctx;
    const g = c.createLinearGradient(0, 0, 0, L.H);
    g.addColorStop(0, '#14203a');
    g.addColorStop(1, '#2a4366');
    c.fillStyle = g;
    c.fillRect(0, 0, L.W, L.H);

    // islands
    c.fillStyle = '#2d2b3d';
    roundRect(c, 20, 150, 380, 420, 40);
    c.fill();
    roundRect(c, L.W - 400, 150, 380, 420, 40);
    c.fill();

    // lightbridge lane
    const top = L.LANE_Y - L.LANE_HALF;
    c.fillStyle = 'rgba(150, 215, 255, 0.16)';
    c.fillRect(L.CORE_X[0], top, L.CORE_X[1] - L.CORE_X[0], L.LANE_HALF * 2);
    c.strokeStyle = 'rgba(170, 225, 255, 0.55)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(L.CORE_X[0], top);
    c.lineTo(L.CORE_X[1], top);
    c.moveTo(L.CORE_X[0], top + L.LANE_HALF * 2);
    c.lineTo(L.CORE_X[1], top + L.LANE_HALF * 2);
    c.stroke();
    c.setLineDash([10, 14]);
    c.strokeStyle = 'rgba(170, 225, 255, 0.18)';
    c.beginPath();
    c.moveTo(L.CORE_X[0], L.LANE_Y);
    c.lineTo(L.CORE_X[1], L.LANE_Y);
    c.stroke();
    c.setLineDash([]);

    // grids
    for (const p of w.players) {
      const r = L.gridRect(p.team, p.slot);
      const mine = p.id === v.humanId;
      c.fillStyle = mine ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)';
      c.fillRect(r.x, r.y, r.w, r.h);
      c.strokeStyle = mine ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
      c.lineWidth = 1;
      for (let i = 0; i <= r.cols; i++) line(c, r.x + i * L.TILE, r.y, r.x + i * L.TILE, r.y + r.h);
      for (let j = 0; j <= r.rows; j++) line(c, r.x, r.y + j * L.TILE, r.x + r.w, r.y + j * L.TILE);
      c.strokeStyle = TEAM_COLORS[p.team];
      c.globalAlpha = mine ? 0.9 : 0.4;
      c.lineWidth = 2;
      c.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
      c.globalAlpha = 1;
      c.fillStyle = mine ? '#ffffff' : 'rgba(255,255,255,0.55)';
      c.font = 'bold 13px system-ui, sans-serif';
      c.textAlign = p.team === 0 ? 'left' : 'right';
      c.textBaseline = 'bottom';
      const label = `${p.name} · ${FACTIONS[p.faction].name}`;
      const ly = p.slot === 0 ? r.y - 4 : r.y + r.h + 17;
      c.fillText(label, p.team === 0 ? r.x : r.x + r.w, ly);
    }
  }

  private drawBuilding(w: World, b: Building, v: ViewState, now: number) {
    const c = this.ctx;
    const fac = FACTIONS[w.players[b.owner].faction];
    const s = L.TILE - 6;
    const x = b.x - s / 2;
    const y = b.y - s / 2;

    if (b.ocT > 0) {
      c.fillStyle = `rgba(255, 150, 40, ${0.35 + 0.25 * Math.sin(now * 12)})`;
      roundRect(c, x - 4, y - 4, s + 8, s + 8, 8);
      c.fill();
    }

    c.fillStyle = fac.dark;
    tileShape(c, fac.shape, b.x, b.y, s);
    c.fill();
    c.strokeStyle = TEAM_COLORS[b.team];
    c.lineWidth = 2;
    c.stroke();
    drawBuildingIcon(c, b.def, b.x, b.y + 1, s, fac.color, b.team === 0 ? 1 : -1);
    if (b.silenceT > 0) {
      c.strokeStyle = '#c08cff';
      c.lineWidth = 3;
      line(c, x + 3, y + 3, x + s - 3, y + s - 3);
      line(c, x + s - 3, y + 3, x + 3, y + s - 3);
    }

    // rank pips
    for (let i = 0; i < b.rank; i++) {
      c.fillStyle = '#ffe066';
      c.beginPath();
      c.arc(x + 5 + i * 6, y + 5, 2.2, 0, Math.PI * 2);
      c.fill();
    }

    // spawn progress
    if (b.def.spawn) {
      const p = 1 - Math.max(0, b.spawnT) / b.def.spawn.interval;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(x, y + s + 1, s, 3);
      c.fillStyle = '#e8f4ff';
      c.fillRect(x, y + s + 1, s * p, 3);
    }
    // bloom progress
    if (fac.mechanic === 'bloom' && b.rank < MAX_RANK) {
      c.strokeStyle = '#9be36b';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x + s - 4, y + 4, 4, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * b.bloomT) / BLOOM_TIME);
      c.stroke();
    }
    if (b.hp < b.maxHp) hpBar(c, b.x, y - 5, s, b.hp / b.maxHp);

    if (v.selected === b) {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      c.setLineDash([4, 3]);
      c.strokeRect(x - 4, y - 4, s + 8, s + 8);
      c.setLineDash([]);
      if (b.def.tower) rangeRing(c, b.x, b.y, b.def.tower.range, b.def.tower.minRange);
    }
  }

  private drawPlacement(w: World, v: ViewState) {
    if (!v.buildDef || !v.hover || v.humanId < 0) return;
    const c = this.ctx;
    const g = w.grid(v.humanId);
    const ok = w.canPlace(v.humanId, v.buildDef.id, v.hover.col, v.hover.row).ok;
    const t = L.tileCenter(g, v.hover.col, v.hover.row);
    c.fillStyle = ok ? 'rgba(120, 255, 140, 0.35)' : 'rgba(255, 90, 90, 0.35)';
    c.fillRect(t.x - L.TILE / 2, t.y - L.TILE / 2, L.TILE, L.TILE);
    c.fillStyle = '#fff';
    c.font = 'bold 13px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(v.buildDef.short, t.x, t.y);
    if (v.buildDef.tower) rangeRing(c, t.x, t.y, v.buildDef.tower.range, v.buildDef.tower.minRange);
  }

  private drawCore(team: number, x: number, y: number, frac: number, alive: boolean) {
    const c = this.ctx;
    c.fillStyle = '#1d1b29';
    c.beginPath();
    c.arc(x, y, L.CORE_R, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = TEAM_COLORS[team];
    c.lineWidth = 3;
    c.stroke();
    if (alive) {
      c.fillStyle = TEAM_COLORS[team];
      c.globalAlpha = 0.5 + 0.5 * frac;
      c.beginPath();
      c.moveTo(x, y - 22);
      c.lineTo(x + 14, y);
      c.lineTo(x, y + 22);
      c.lineTo(x - 14, y);
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
    }
    c.strokeStyle = '#ffffff';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(x, y, L.CORE_R + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, frac));
    c.stroke();
  }

  private drawUnit(u: World['units'][number], now: number) {
    const c = this.ctx;
    const r = u.radius;
    let y = u.y;
    if (u.flying) {
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.ellipse(u.x, u.y + 6, r, r * 0.45, 0, 0, Math.PI * 2);
      c.fill();
      y = u.y - 12 + Math.sin(now * 4 + u.id) * 1.5;
    }
    if (u.stunT > 0) y -= 8; // snatched into the air
    if (u.echo) c.globalAlpha = 0.5;
    drawUnitShape(c, u.def.id, u.x, y, r, u.echo ? '#a8ffe0' : TEAM_COLORS[u.team], r >= 13 ? 3 : 2, u.team === 0 ? 1 : -1);
    c.globalAlpha = 1;
    if (u.stunT > 0) {
      c.strokeStyle = '#ffe066';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(u.x, y, r + 4, 0, Math.PI * 2);
      c.stroke();
    }
    if (u.curseT > 0) {
      c.fillStyle = '#ff6ad5';
      c.beginPath();
      c.arc(u.x + r, y - r, 2.5, 0, Math.PI * 2);
      c.fill();
    }
    if (u.flying) {
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 1.5;
      line(c, u.x - r - 5, y - 3, u.x - r, y);
      line(c, u.x + r + 5, y - 3, u.x + r, y);
    }
    if (u.rootT > 0) {
      c.strokeStyle = '#9be36b';
      c.lineWidth = 2;
      c.strokeRect(u.x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4);
    } else if (u.slowT > 0) {
      c.fillStyle = 'rgba(155, 227, 107, 0.8)';
      c.fillRect(u.x - 2, y + r + 2, 4, 2);
    }
    if (u.hp < u.maxHp) hpBar(c, u.x, y - r - 5, Math.max(12, r * 2), u.hp / u.maxHp);
  }

  private drawFx(now: number) {
    const c = this.ctx;
    this.fx = this.fx.filter((f) => now - f.t0 < f.life);
    for (const f of this.fx) {
      const k = (now - f.t0) / f.life;
      c.globalAlpha = 1 - k;
      switch (f.kind) {
        case 'shot':
          c.strokeStyle = f.color;
          c.lineWidth = 1.5;
          line(c, f.x, f.y, f.x2!, f.y2!);
          break;
        case 'splash':
        case 'root':
          c.strokeStyle = f.color;
          c.lineWidth = 2;
          c.beginPath();
          c.arc(f.x, f.y, f.r! * (0.5 + 0.5 * k), 0, Math.PI * 2);
          c.stroke();
          break;
        case 'death':
          c.fillStyle = f.color;
          c.beginPath();
          c.arc(f.x, f.y, f.r! * (0.4 + k), 0, Math.PI * 2);
          c.fill();
          break;
        case 'gale': {
          // a bright gust sweeping down the bridge, away from the caster
          const dir = f.x;
          const span = L.CORE_X[1] - L.CORE_X[0];
          const front = dir > 0 ? L.CORE_X[0] + span * k : L.CORE_X[1] - span * k;
          const g = c.createLinearGradient(front - dir * 220, 0, front, 0);
          g.addColorStop(0, 'rgba(232,251,255,0)');
          g.addColorStop(1, 'rgba(232,251,255,0.55)');
          c.fillStyle = g;
          c.globalAlpha = 1;
          const x0 = Math.min(front, front - dir * 220);
          c.fillRect(x0, L.LANE_Y - L.LANE_HALF - 10, 220, L.LANE_HALF * 2 + 20);
          break;
        }
        case 'text':
        case 'rank':
          c.fillStyle = f.color;
          c.font = 'bold 13px system-ui, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(f.text!, f.x, f.y - k * 18);
          break;
      }
    }
    c.globalAlpha = 1;
  }
}

function line(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

/** Building tile outline per faction: Union square, Bloomkin circle, Aerie diamond, Choir hexagon. */
function tileShape(c: CanvasRenderingContext2D, shape: string, cx: number, cy: number, s: number) {
  const h = s / 2;
  c.beginPath();
  if (shape === 'circle') c.arc(cx, cy, h, 0, Math.PI * 2);
  else if (shape === 'diamond') {
    c.moveTo(cx, cy - h - 2);
    c.lineTo(cx + h + 2, cy);
    c.lineTo(cx, cy + h + 2);
    c.lineTo(cx - h - 2, cy);
    c.closePath();
  } else if (shape === 'hex') {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const px = cx + Math.cos(a) * (h + 1);
      const py = cy + Math.sin(a) * (h + 1);
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
  } else roundRect(c, cx - h, cy - h, s, s, 4);
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function hpBar(c: CanvasRenderingContext2D, cx: number, y: number, w: number, frac: number) {
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.fillRect(cx - w / 2, y, w, 3);
  c.fillStyle = frac > 0.5 ? '#6be36b' : frac > 0.25 ? '#ffd24a' : '#ff5a5a';
  c.fillRect(cx - w / 2, y, w * Math.max(0, frac), 3);
}

function rangeRing(c: CanvasRenderingContext2D, x: number, y: number, r: number, min?: number) {
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 1;
  c.setLineDash([6, 6]);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  if (min) {
    c.beginPath();
    c.arc(x, y, min, 0, Math.PI * 2);
    c.stroke();
  }
  c.setLineDash([]);
}
