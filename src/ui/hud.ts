import { cap, strongVs, weakVs } from '../data/damage';
import { FACTIONS } from '../data/factions';
import { drawBuildingIcon } from '../render/shapes';
import type { BuildingDef } from '../data/types';
import { OVERTIME_AT, TIER_TIMES, INCOME_INTERVAL, MAX_RANK, OVERCLOCK_TIME, rankMult, type Building, type World } from '../sim/world';

export interface HudHandlers {
  selectBuild(def: BuildingDef | null): void;
  upgrade(): void;
  overclock(): void;
  setSpeed(n: number): void;
  togglePause(): void;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function describe(def: BuildingDef): string {
  const lines = [def.desc];
  const atk = def.spawn?.unit.attack ?? def.tower?.attack;
  const u = def.spawn?.unit;
  if (u) lines.push(`${u.name}: ${Math.round(u.hp)} HP, ${u.dmg} dmg, ${cap(u.attack)} attack / ${cap(u.armor)} armor${u.flying ? ', flying' : ''}`);
  if (def.tower) lines.push(`${def.tower.dmg} dmg, range ${def.tower.range}, ${cap(def.tower.attack)} attack`);
  if (atk) {
    const s = strongVs(atk).map(cap).join(', ');
    const wk = weakVs(atk).map(cap).join(', ');
    if (s) lines.push(`Strong vs ${s}`);
    if (wk) lines.push(`Weak vs ${wk}`);
  }
  return lines.join('\n');
}

export class Hud {
  private buttons: { def: BuildingDef; el: HTMLButtonElement }[] = [];
  private last = '';

  constructor(private root: HTMLElement, private h: HudHandlers) {
    $('#speed', root).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.speed) this.h.setSpeed(Number(b.dataset.speed));
    });
    $('#pause-btn', root).addEventListener('click', () => this.h.togglePause());
    $('#sel-upgrade', root).addEventListener('click', () => this.h.upgrade());
    $('#sel-overclock', root).addEventListener('click', () => this.h.overclock());
  }

  setup(w: World, humanId: number) {
    const fac = FACTIONS[w.players[humanId].faction];
    const bar = $('#build-buttons', this.root);
    bar.innerHTML = '';
    this.buttons = fac.buildings.map((def, i) => {
      const el = document.createElement('button');
      el.className = `bbtn kind-${def.kind}`;
      el.title = describe(def);
      el.innerHTML = `<span class="hk">${i + 1}</span><span class="tier">T${def.tier}</span>
        <canvas class="icon" width="68" height="52"></canvas>
        <span class="nm">${def.name}</span><span class="cost">${def.cost}g</span><span class="lock"></span>`;
      const cv = el.querySelector('canvas')!;
      const cx = cv.getContext('2d')!;
      cx.scale(2, 2);
      drawBuildingIcon(cx, def, 17, 14, 30, fac.color);
      el.addEventListener('click', () => this.h.selectBuild(def));
      bar.appendChild(el);
      return { def, el };
    });
    $('#mechanic', this.root).textContent = fac.mechanicText;
    this.last = '';
  }

  update(w: World, humanId: number, buildDef: BuildingDef | null, sel: Building | null, speed: number, paused: boolean) {
    const p = w.players[humanId];
    const key = [Math.floor(p.gold), Math.floor(w.time * 4), buildDef?.id, sel?.id, sel?.rank, Math.round(sel?.hp ?? 0), speed, paused].join('|');
    if (key === this.last) return;
    this.last = key;

    $('#gold', this.root).textContent = String(Math.floor(p.gold));
    const inc = w.income(humanId);
    $('#income', this.root).textContent = `+${inc} / ${INCOME_INTERVAL}s${w.comebackMult(p.team) > 1 ? ' (comeback +40%)' : ''}`;
    $('#clock', this.root).textContent = fmtTime(w.time);
    const t2 = TIER_TIMES[2] - w.time;
    const t3 = TIER_TIMES[3] - w.time;
    const ot = w.overtimeMult();
    $('#tier', this.root).textContent =
      t2 > 0 ? `Tier 2 in ${fmtTime(t2)}` : t3 > 0 ? `Tier 3 in ${fmtTime(t3)}` : ot > 1 ? `OVERTIME: damage ×${ot.toFixed(2)}` : `Overtime in ${fmtTime(OVERTIME_AT - w.time)}`;
    for (let t = 0; t < 2; t++) {
      const core = w.cores[t];
      ($(`#core${t} i`, this.root) as HTMLElement).style.width = `${Math.max(0, (core.hp / core.maxHp) * 100)}%`;
      $(`#core${t} b`, this.root).textContent = `${Math.max(0, Math.ceil(core.hp))}`;
    }

    for (const { def, el } of this.buttons) {
      const locked = !w.tierUnlocked(def.tier);
      el.classList.toggle('locked', locked);
      el.classList.toggle('poor', !locked && p.gold < def.cost);
      el.classList.toggle('active', buildDef === def);
      ($('.lock', el) as HTMLElement).textContent = locked ? fmtTime(TIER_TIMES[def.tier] - w.time) : '';
    }

    this.root.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === speed));
    $('#pause-btn', this.root).textContent = paused ? '▶ Resume' : '❚❚ Pause';

    const panel = $('#sel-panel', this.root);
    if (!sel || !sel.alive) {
      panel.classList.add('empty');
      $('#sel-title', panel).textContent = buildDef ? `Placing: ${buildDef.name}` : 'Nothing selected';
      $('#sel-info', panel).textContent = buildDef
        ? describe(buildDef)
        : 'Pick a building (1–8), then click a tile on your highlighted grid. Click your own building to upgrade it.';
      ($('#sel-actions', panel) as HTMLElement).style.display = 'none';
      return;
    }
    panel.classList.remove('empty');
    const fac = FACTIONS[p.faction];
    $('#sel-title', panel).textContent = `${sel.def.name} — rank ${sel.rank}/${MAX_RANK}`;
    const info: string[] = [`HP ${Math.ceil(sel.hp)} / ${Math.ceil(sel.maxHp)}`];
    if (sel.def.spawn) info.push(`${sel.def.spawn.count ?? 1}× ${sel.def.spawn.unit.name} every ${sel.def.spawn.interval}s (stats ×${rankMult(sel.rank).toFixed(1)})`);
    if (sel.def.tower) info.push(`${Math.round(sel.def.tower.dmg * rankMult(sel.rank))} dmg, range ${sel.def.tower.range}`);
    if (sel.def.kind === 'econ') info.push(`Adds income each tick`);
    if (sel.ocT > 0) info.push(`OVERCLOCKED ${Math.ceil(sel.ocT)}s`);
    $('#sel-info', panel).textContent = info.join('\n');
    ($('#sel-actions', panel) as HTMLElement).style.display = '';

    const up = $<HTMLButtonElement>('#sel-upgrade', panel);
    up.style.display = sel.owner === humanId ? '' : 'none';
    if (sel.rank >= MAX_RANK) {
      up.textContent = 'Max rank';
      up.disabled = true;
    } else {
      up.textContent = `Upgrade (U) — ${w.upgradeCost(sel)}g`;
      up.disabled = !w.canUpgrade(humanId, sel);
    }
    const oc = $<HTMLButtonElement>('#sel-overclock', panel);
    const canOcKind = fac.mechanic === 'overclock' && sel.def.kind !== 'tower' && sel.owner === humanId;
    oc.style.display = canOcKind ? '' : 'none';
    if (canOcKind) {
      oc.disabled = !w.canOverclock(humanId, sel);
      oc.textContent = sel.ocT > 0 ? `Overclocked (${Math.ceil(sel.ocT)}s)` : sel.ocCd > 0 ? `Overclock in ${Math.ceil(sel.ocCd)}s` : `Overclock (O) — 25% HP, ${OVERCLOCK_TIME}s`;
    }
  }
}
