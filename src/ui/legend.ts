import { ARMORS, DAMAGE, cap, strongVs, weakVs } from '../data/damage';
import { FACTIONS } from '../data/factions';
import type { ArmorType, AttackType, BuildingDef, FactionId, UnitDef } from '../data/types';
import { ATTACK_COLORS, drawUnitShape } from '../render/shapes';
import type { World } from '../sim/world';

const ATTACKS: AttackType[] = ['pierce', 'normal', 'siege', 'magic'];
const ARMOR_COLORS: Record<ArmorType, string> = { light: '#cfe3ff', heavy: '#9aa3b5', fortified: '#d8b98a', arcane: '#b9a2ff' };

const chip = (txt: string, bg: string) => `<span class="chip" style="background:${bg}">${txt}</span>`;
export const atkChip = (a: AttackType) => chip(cap(a), ATTACK_COLORS[a]);
export const armChip = (a: ArmorType) => chip(cap(a), ARMOR_COLORS[a]);

interface Attacker {
  def: BuildingDef;
  attack: AttackType;
  hitsAir: boolean;
  hitsGround: boolean;
}

function attackersOf(faction: FactionId): Attacker[] {
  const out: Attacker[] = [];
  for (const def of FACTIONS[faction].buildings) {
    if (def.spawn) {
      const u = def.spawn.unit;
      out.push({ def, attack: u.attack, hitsAir: !!u.hitsAir, hitsGround: u.hitsGround ?? true });
    } else if (def.tower) out.push({ def, attack: def.tower.attack, hitsAir: def.tower.hitsAir, hitsGround: true });
  }
  return out;
}

/** Which of `faction`'s buildings deal the most damage to this armor (and can actually hit it). */
export function countersFor(faction: FactionId, armor: ArmorType, flying: boolean): BuildingDef[] {
  const able = attackersOf(faction).filter((a) => (flying ? a.hitsAir : a.hitsGround));
  if (!able.length) return [];
  const best = Math.max(...able.map((a) => DAMAGE[a.attack][armor]));
  const threshold = best >= 1.25 ? 1.25 : best;
  return able
    .filter((a) => DAMAGE[a.attack][armor] >= threshold)
    .sort((a, b) => DAMAGE[b.attack][armor] - DAMAGE[a.attack][armor] || a.def.tier - b.def.tier)
    .slice(0, 3)
    .map((a) => a.def);
}

function traits(u: UnitDef, count: number): string {
  const t: string[] = [];
  t.push(u.range > 60 ? 'ranged' : 'melee');
  if (count > 1) t.push(`swarm ×${count}`);
  if (u.flying) t.push('flying');
  if (u.hitsAir) t.push('hits air');
  if (u.splash) t.push('splash');
  if (u.chain) t.push(`chains to ${u.chain}`);
  if (u.regen) t.push('heals itself');
  if (u.root) t.push('roots enemies');
  if (u.preferRanged) t.push('hunts ranged');
  return t.join(' · ');
}

function damageTable(): string {
  let h = '<table class="dmg"><tr><th>Attack ↓ / Armor →</th>' + ARMORS.map((a) => `<th>${armChip(a)}</th>`).join('') + '</tr>';
  for (const atk of ATTACKS) {
    h += `<tr><th>${atkChip(atk)}</th>`;
    for (const arm of ARMORS) {
      const v = DAMAGE[atk][arm];
      h += `<td class="${v >= 1.25 ? 'good' : v <= 0.75 ? 'bad' : ''}">${Math.round(v * 100)}%</td>`;
    }
    h += '</tr>';
  }
  return h + '</table>';
}

/** Full-screen "Units & counters" reference, written from `viewer`'s point of view. */
export class Legend {
  private el: HTMLElement;
  open = false;

  constructor(root: HTMLElement, private onClose: () => void) {
    this.el = document.createElement('div');
    this.el.id = 'legend';
    this.el.className = 'overlay hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el || (e.target as HTMLElement).closest('.legend-close')) this.hide();
    });
  }

  show(viewer: FactionId) {
    const enemy: FactionId = viewer === 'union' ? 'bloomkin' : 'union';
    const col = (f: FactionId) => {
      const fac = FACTIONS[f];
      const rows = fac.buildings
        .filter((b) => b.spawn)
        .map((b) => {
          const u = b.spawn!.unit;
          const strong = strongVs(u.attack).map(cap).join(', ') || '—';
          const weak = weakVs(u.attack).map(cap).join(', ') || '—';
          const ctr = countersFor(viewer, u.armor, !!u.flying);
          const ctrTxt = ctr.length ? ctr.map((d) => d.name).join(', ') : 'nothing — rely on towers';
          return `<div class="lrow">
            <canvas data-unit="${u.id}" data-dir="${f === viewer ? 1 : -1}" width="80" height="64"></canvas>
            <div class="ltxt">
              <div><b>${u.name}</b> <span class="muted">from ${b.name} · T${b.tier}</span></div>
              <div>${atkChip(u.attack)} attack · ${armChip(u.armor)} armor <span class="muted">· ${traits(u, b.spawn!.count ?? 1)}</span></div>
              <div class="muted">Strong vs <b>${strong}</b> armor · weak vs ${weak}</div>
              ${f === viewer ? '' : `<div class="ctr">Counter it with: <b>${ctrTxt}</b></div>`}
            </div></div>`;
        })
        .join('');
      return `<div class="lcol"><h2 style="color:${fac.color}">${f === viewer ? 'Your units' : 'Enemy units'} — ${fac.name}</h2>${rows}</div>`;
    };

    this.el.innerHTML = `<div class="panel legend-panel">
      <button class="legend-close">✕ Close (L)</button>
      <h1>Units &amp; counters</h1>
      <div class="lgrid">
        <div class="lcol narrow">
          <h2>How damage works</h2>
          ${damageTable()}
          <p>Every attack has a <b>type</b> and every unit has an <b>armor</b>. Green cells deal extra damage, red cells deal less.</p>
          <p>All buildings and Heartstones have ${armChip('fortified')} armor, so ${atkChip('siege')} units are your building-breakers.</p>
          <p>Flying units can only be hit by units or towers that <b>hit air</b>.</p>
          <p class="muted">Shot colours on the battlefield match the attack type.</p>
        </div>
        ${col(enemy)}
        ${col(viewer)}
      </div></div>`;

    this.el.querySelectorAll<HTMLCanvasElement>('canvas[data-unit]').forEach((cv) => {
      const c = cv.getContext('2d')!;
      c.scale(2, 2);
      const id = cv.dataset.unit!;
      const def = Object.values(FACTIONS).flatMap((f) => f.buildings).find((b) => b.spawn?.unit.id === id)!.spawn!.unit;
      drawUnitShape(c, id, 20, 17, Math.min(12, def.size * 0.9), '#ffffff', 1.5, Number(cv.dataset.dir));
    });
    this.el.classList.remove('hidden');
    this.open = true;
  }

  hide() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.open = false;
    this.onClose();
  }
}

/** One-line live scouting hint: what the enemy is fielding and what beats it. */
export function scoutHint(w: World, humanId: number): string {
  const me = w.players[humanId];
  const weight: Partial<Record<string, number>> = {};
  let total = 0;
  const flyingArmor: Partial<Record<ArmorType, number>> = {};
  for (const u of w.units) {
    if (u.team === me.team) continue;
    const k = u.armor;
    const n = u.radius >= 13 ? 3 : 1;
    weight[k] = (weight[k] ?? 0) + n;
    if (u.flying) flyingArmor[k] = (flyingArmor[k] ?? 0) + n;
    total += n;
  }
  if (total < 3) return '';
  const [armor, n] = (Object.entries(weight) as [ArmorType, number][]).sort((a, b) => b[1] - a[1])[0];
  const pct = Math.round((n / total) * 100);
  const mostlyFlying = (flyingArmor[armor] ?? 0) > n / 2;
  const unlocked = countersFor(me.faction, armor, mostlyFlying).filter((d) => w.tierUnlocked(d.tier));
  const tip = unlocked.length ? ` → build ${unlocked.map((d) => d.name).join(' or ')}` : '';
  return `Scout: enemy army is ${pct}% ${armChip(armor)}${mostlyFlying ? ' (flying)' : ''}${tip}`;
}
