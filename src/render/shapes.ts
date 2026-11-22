import type { AttackType, BuildingDef } from '../data/types';

/**
 * Simple-but-distinct silhouettes. Each unit type has its own shape and colour;
 * team is shown by the outline colour. dir = 1 faces right, -1 faces left.
 */
export const UNIT_COLORS: Record<string, string> = {
  rivetman: '#c98a3d',
  boltcaster: '#e8c75a',
  walker: '#8d96a6',
  sparkwright: '#5fd6ee',
  thunderhull: '#b8743a',
  thornling: '#86e05c',
  puffcap: '#c47ae6',
  moss_golem: '#3f8f3a',
  stinger: '#f2c230',
  rootwarden: '#3e9a46',
  skimmer: '#bfeee8',
  talonguard: '#e8e1cf',
  thunderbird: '#57b8c9',
  mender_kite: '#f4f0e6',
  storm_roc: '#a08660',
  shade: '#6a5fd0',
  cantor: '#9be8d0',
  revenant: '#565c8c',
  hexer: '#d07ab8',
  dirge: '#cfe0ff',
};

export const ATTACK_COLORS: Record<AttackType, string> = { pierce: '#f2f2f2', normal: '#ffd27a', siege: '#ff8c3a', magic: '#c98bff' };

type C = CanvasRenderingContext2D;

function poly(c: C, pts: [number, number][]) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
}

function body(c: C, fill: string, stroke: string, lw: number) {
  c.fillStyle = fill;
  c.fill();
  if (lw > 0) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

export function drawUnitShape(c: C, id: string, x: number, y: number, r: number, stroke: string, lw: number, dir: number) {
  const fill = UNIT_COLORS[id] ?? '#cccccc';
  c.lineJoin = 'round';
  switch (id) {
    case 'rivetman': {
      // square brawler with a dark shield on the front
      c.beginPath();
      c.rect(x - r, y - r, r * 2, r * 2);
      body(c, fill, stroke, lw);
      c.fillStyle = '#5a3a14';
      c.fillRect(dir > 0 ? x + r * 0.35 : x - r * 0.35 - r * 0.55, y - r * 0.8, r * 0.55, r * 1.6);
      break;
    }
    case 'boltcaster': {
      // arrowhead pointing at the enemy
      poly(c, [[x + dir * r * 1.3, y], [x - dir * r, y - r], [x - dir * r * 0.45, y], [x - dir * r, y + r]]);
      body(c, fill, stroke, lw);
      break;
    }
    case 'walker': {
      // boxy boiler on two legs, ram in front, chimney on top
      c.fillStyle = '#4b505a';
      c.fillRect(x - r * 0.7, y + r * 0.45, r * 0.4, r * 0.6);
      c.fillRect(x + r * 0.3, y + r * 0.45, r * 0.4, r * 0.6);
      c.fillRect(x - r * 0.15 - dir * r * 0.4, y - r * 1.15, r * 0.3, r * 0.4);
      c.beginPath();
      c.roundRect(x - r, y - r * 0.8, r * 2, r * 1.35, r * 0.25);
      body(c, fill, stroke, lw);
      c.fillStyle = '#4b505a';
      c.fillRect(dir > 0 ? x + r : x - r - r * 0.45, y - r * 0.25, r * 0.45, r * 0.45);
      c.fillStyle = '#ff9d3a';
      c.beginPath();
      c.arc(x + dir * r * 0.35, y - r * 0.15, r * 0.18, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'sparkwright': {
      // diamond with a lightning bolt
      poly(c, [[x, y - r * 1.25], [x + r, y], [x, y + r * 1.25], [x - r, y]]);
      body(c, fill, stroke, lw);
      c.strokeStyle = '#ffffff';
      c.lineWidth = Math.max(1, r * 0.2);
      c.beginPath();
      c.moveTo(x - r * 0.25, y - r * 0.7);
      c.lineTo(x + r * 0.2, y - r * 0.05);
      c.lineTo(x - r * 0.2, y + r * 0.05);
      c.lineTo(x + r * 0.25, y + r * 0.7);
      c.stroke();
      break;
    }
    case 'thunderhull': {
      // airship: balloon + gondola
      c.fillStyle = '#5a3a14';
      c.fillRect(x - r * 0.5, y + r * 0.45, r, r * 0.35);
      c.beginPath();
      c.ellipse(x, y - r * 0.15, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
      body(c, fill, stroke, lw);
      c.strokeStyle = '#5a3a14';
      c.lineWidth = Math.max(1, r * 0.12);
      for (const k of [-0.5, 0, 0.5]) {
        c.beginPath();
        c.moveTo(x + k * r * 1.4, y - r * 0.8);
        c.lineTo(x + k * r * 1.4, y + r * 0.5);
        c.stroke();
      }
      break;
    }
    case 'thornling': {
      // spiky star
      const pts: [number, number][] = [];
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12 - Math.PI / 2;
        const rr = i % 2 === 0 ? r * 1.35 : r * 0.65;
        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
      }
      poly(c, pts);
      body(c, fill, stroke, lw);
      break;
    }
    case 'puffcap': {
      // mushroom: stem + dome cap with spots
      c.fillStyle = '#efe3c8';
      c.fillRect(x - r * 0.35, y - r * 0.1, r * 0.7, r * 1.05);
      c.beginPath();
      c.arc(x, y + r * 0.05, r * 1.15, Math.PI, 0);
      c.closePath();
      body(c, fill, stroke, lw);
      c.fillStyle = '#ffffff';
      for (const [dx, dy] of [[-0.45, -0.45], [0.2, -0.75], [0.55, -0.3]]) {
        c.beginPath();
        c.arc(x + dx * r, y + dy * r, r * 0.16, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case 'moss_golem': {
      // lumpy blob with glowing eyes
      c.beginPath();
      c.arc(x, y - r * 0.15, r * 0.85, 0, Math.PI * 2);
      c.moveTo(x - r * 0.55 + r * 0.6, y + r * 0.3);
      c.arc(x - r * 0.55, y + r * 0.3, r * 0.6, 0, Math.PI * 2);
      c.moveTo(x + r * 0.55 + r * 0.6, y + r * 0.3);
      c.arc(x + r * 0.55, y + r * 0.3, r * 0.6, 0, Math.PI * 2);
      // outline the merged silhouette only: wide stroke first, then fill over the inner overlaps
      if (lw > 0) {
        c.strokeStyle = stroke;
        c.lineWidth = lw * 2;
        c.stroke();
      }
      c.fillStyle = fill;
      c.fill();
      c.fillStyle = '#e8ff7a';
      c.fillRect(x + dir * r * 0.1 - r * 0.28, y - r * 0.3, r * 0.18, r * 0.18);
      c.fillRect(x + dir * r * 0.1 + r * 0.1, y - r * 0.3, r * 0.18, r * 0.18);
      break;
    }
    case 'stinger': {
      // bee: striped teardrop pointing forward
      poly(c, [[x + dir * r * 1.4, y], [x + dir * r * 0.2, y - r * 0.8], [x - dir * r * 1.0, y - r * 0.5], [x - dir * r * 1.0, y + r * 0.5], [x + dir * r * 0.2, y + r * 0.8]]);
      body(c, fill, stroke, lw);
      c.fillStyle = '#222';
      c.fillRect(x - r * 0.2, y - r * 0.7, r * 0.35, r * 1.4);
      break;
    }
    case 'rootwarden': {
      // tree: trunk with roots + big canopy
      c.fillStyle = '#7a4e26';
      c.fillRect(x - r * 0.25, y, r * 0.5, r * 1.0);
      c.strokeStyle = '#7a4e26';
      c.lineWidth = Math.max(1.5, r * 0.15);
      c.beginPath();
      c.moveTo(x, y + r * 0.9);
      c.lineTo(x - r * 0.75, y + r * 1.1);
      c.moveTo(x, y + r * 0.9);
      c.lineTo(x + r * 0.75, y + r * 1.1);
      c.stroke();
      c.beginPath();
      c.arc(x, y - r * 0.3, r * 0.9, 0, Math.PI * 2);
      body(c, fill, stroke, lw);
      c.fillStyle = '#9be36b';
      c.beginPath();
      c.arc(x - r * 0.3, y - r * 0.55, r * 0.22, 0, Math.PI * 2);
      c.arc(x + r * 0.35, y - r * 0.2, r * 0.18, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'skimmer': {
      // swept-back chevron dart
      poly(c, [[x + dir * r * 1.4, y], [x - dir * r, y - r], [x - dir * r * 0.3, y], [x - dir * r, y + r]]);
      body(c, fill, stroke, lw);
      c.fillStyle = '#1f4f55';
      c.beginPath();
      c.arc(x + dir * r * 0.35, y, r * 0.2, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'talonguard': {
      // tall bird-warrior triangle with a spear forward
      c.strokeStyle = '#6b5a3a';
      c.lineWidth = Math.max(1.5, r * 0.18);
      c.beginPath();
      c.moveTo(x - dir * r * 0.4, y + r * 0.2);
      c.lineTo(x + dir * r * 1.6, y - r * 0.5);
      c.stroke();
      poly(c, [[x, y - r * 1.3], [x + r * 0.9, y + r], [x - r * 0.9, y + r]]);
      body(c, fill, stroke, lw);
      c.fillStyle = '#e0a83a';
      poly(c, [[x + dir * r * 0.15, y - r * 0.55], [x + dir * r * 0.65, y - r * 0.4], [x + dir * r * 0.15, y - r * 0.25]]);
      c.fill();
      break;
    }
    case 'thunderbird': {
      // gull-wing "M" with a lightning eye
      poly(c, [[x - r * 1.5, y - r * 0.2], [x - r * 0.7, y - r * 0.9], [x, y - r * 0.1], [x + r * 0.7, y - r * 0.9], [x + r * 1.5, y - r * 0.2], [x + r * 0.5, y + r * 0.6], [x, y + r * 0.3], [x - r * 0.5, y + r * 0.6]]);
      body(c, fill, stroke, lw);
      c.fillStyle = '#ffe066';
      c.beginPath();
      c.arc(x + dir * r * 0.2, y - r * 0.05, r * 0.2, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'mender_kite': {
      // kite diamond with a green cross and a tail
      c.strokeStyle = '#7dff8a';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x, y + r * 1.2);
      c.quadraticCurveTo(x - dir * r * 0.6, y + r * 1.8, x - dir * r * 0.1, y + r * 2.3);
      c.stroke();
      poly(c, [[x, y - r * 1.3], [x + r * 0.9, y - r * 0.1], [x, y + r * 1.2], [x - r * 0.9, y - r * 0.1]]);
      body(c, fill, stroke, lw);
      c.fillStyle = '#2fbf4a';
      c.fillRect(x - r * 0.12, y - r * 0.6, r * 0.24, r * 0.9);
      c.fillRect(x - r * 0.45, y - r * 0.27, r * 0.9, r * 0.24);
      break;
    }
    case 'storm_roc': {
      // big raptor: broad swept wings, hooked head
      poly(c, [[x + dir * r * 1.3, y - r * 0.1], [x + dir * r * 0.3, y - r * 0.35], [x - dir * r * 0.2, y - r * 1.1], [x - dir * r * 1.5, y - r * 0.9], [x - dir * r * 0.6, y - r * 0.1], [x - dir * r * 1.3, y + r * 0.5], [x + dir * r * 0.2, y + r * 0.4]]);
      body(c, fill, stroke, lw);
      c.fillStyle = '#e0a83a';
      poly(c, [[x + dir * r * 1.3, y - r * 0.1], [x + dir * r * 1.7, y + r * 0.1], [x + dir * r * 1.2, y + r * 0.15]]);
      c.fill();
      break;
    }
    case 'shade':
    case 'dirge': {
      // ghost: dome top, wavy hem; the Dirge gets a wailing mouth
      const big = id === 'dirge';
      c.beginPath();
      c.moveTo(x - r, y + r);
      c.lineTo(x - r, y - r * 0.1);
      c.arc(x, y - r * 0.1, r, Math.PI, 0);
      c.lineTo(x + r, y + r);
      const waves = big ? 4 : 3;
      for (let i = 0; i < waves; i++) {
        const x1 = x + r - ((i + 0.5) * 2 * r) / waves;
        const x2 = x + r - ((i + 1) * 2 * r) / waves;
        c.quadraticCurveTo(x1, y + r * (i % 2 ? 1.35 : 0.65), x2, y + r);
      }
      c.closePath();
      body(c, fill, stroke, lw);
      c.fillStyle = big ? '#2a2560' : '#cfe0ff';
      c.beginPath();
      c.arc(x + dir * r * 0.15 - r * 0.32, y - r * 0.2, r * 0.15, 0, Math.PI * 2);
      c.arc(x + dir * r * 0.15 + r * 0.32, y - r * 0.2, r * 0.15, 0, Math.PI * 2);
      c.fill();
      if (big) {
        c.beginPath();
        c.ellipse(x + dir * r * 0.15, y + r * 0.3, r * 0.2, r * 0.32, 0, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case 'cantor': {
      // robed singer: round head on a bell-shaped robe, open "O" mouth
      poly(c, [[x - r * 0.45, y - r * 0.1], [x + r * 0.45, y - r * 0.1], [x + r, y + r * 1.1], [x - r, y + r * 1.1]]);
      body(c, fill, stroke, lw);
      c.beginPath();
      c.arc(x, y - r * 0.55, r * 0.6, 0, Math.PI * 2);
      body(c, '#efe3c8', stroke, lw * 0.7);
      c.strokeStyle = '#2a2560';
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(x + dir * r * 0.2, y - r * 0.45, r * 0.18, 0, Math.PI * 2);
      c.stroke();
      break;
    }
    case 'revenant': {
      // heater shield with a visor slit
      poly(c, [[x - r, y - r], [x + r, y - r], [x + r, y + r * 0.1], [x, y + r * 1.25], [x - r, y + r * 0.1]]);
      body(c, fill, stroke, lw);
      c.fillStyle = '#a8ffe0';
      c.fillRect(x - r * 0.6, y - r * 0.45, r * 1.2, r * 0.2);
      break;
    }
    case 'hexer': {
      // hexagon mask with one eye
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) pts.push([x + Math.cos((Math.PI / 3) * i + Math.PI / 6) * r * 1.15, y + Math.sin((Math.PI / 3) * i + Math.PI / 6) * r * 1.15]);
      poly(c, pts);
      body(c, fill, stroke, lw);
      c.fillStyle = '#2a2560';
      c.beginPath();
      c.ellipse(x + dir * r * 0.15, y, r * 0.45, r * 0.25, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffe066';
      c.beginPath();
      c.arc(x + dir * r * 0.2, y, r * 0.13, 0, Math.PI * 2);
      c.fill();
      break;
    }
    default: {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      body(c, fill, stroke, lw);
    }
  }
}

/** Icon used on building tiles and build buttons. s = icon size in px. */
export function drawBuildingIcon(c: C, def: BuildingDef, x: number, y: number, s: number, factionColor: string, dir = 1) {
  if (def.spawn) {
    const u = def.spawn.unit;
    if (def.spawn.count && def.spawn.count > 2) {
      drawUnitShape(c, u.id, x - s * 0.2, y + s * 0.1, s * 0.18, '#111', 1.2, dir);
      drawUnitShape(c, u.id, x + s * 0.2, y + s * 0.1, s * 0.18, '#111', 1.2, dir);
      drawUnitShape(c, u.id, x, y - s * 0.15, s * 0.18, '#111', 1.2, dir);
      return;
    }
    const r = s * (u.size >= 13 ? 0.3 : 0.26);
    if (def.spawn.count && def.spawn.count > 1) {
      drawUnitShape(c, u.id, x - s * 0.17, y + s * 0.08, r * 0.8, '#111', 1.2, dir);
      drawUnitShape(c, u.id, x + s * 0.17, y - s * 0.08, r * 0.8, '#111', 1.2, dir);
    } else drawUnitShape(c, u.id, x, y, r, '#111', 1.2, dir);
    return;
  }
  if (def.tower) {
    // tower: base + gem in its attack colour
    c.fillStyle = factionColor;
    poly(c, [[x - s * 0.3, y + s * 0.38], [x + s * 0.3, y + s * 0.38], [x + s * 0.18, y - s * 0.15], [x - s * 0.18, y - s * 0.15]]);
    c.fill();
    c.strokeStyle = '#111';
    c.lineWidth = 1.2;
    c.stroke();
    c.fillStyle = ATTACK_COLORS[def.tower.attack];
    poly(c, [[x, y - s * 0.45], [x + s * 0.17, y - s * 0.2], [x, y + s * 0.02], [x - s * 0.17, y - s * 0.2]]);
    c.fill();
    c.stroke();
    if (def.tower.splash) {
      c.strokeStyle = ATTACK_COLORS[def.tower.attack];
      c.beginPath();
      c.arc(x, y - s * 0.2, s * 0.3, 0, Math.PI * 2);
      c.stroke();
    }
    return;
  }
  // economy: gold coin
  c.fillStyle = '#ffd84a';
  c.beginPath();
  c.arc(x, y, s * 0.3, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#7a5a10';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = '#7a5a10';
  c.font = `bold ${Math.round(s * 0.36)}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('$', x, y + 1);
}
