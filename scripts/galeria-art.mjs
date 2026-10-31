// Desenhos iniciais da galeria de cortes e barbas (public/galeria/*.svg).
// São ilustrações próprias (sem foto de terceiros), então podem ser usadas à vontade.
// O dono troca qualquer uma por uma foto de verdade no painel (Galeria).
// Uso: node scripts/galeria-art.mjs
import fs from "node:fs";

const W = 200, H = 250;
const SKIN = "#d9a27a", SKIN_D = "#c48a62", LIP = "#b0705a";
const HAIR = "#2b211c", HAIR_L = "#4a3a30", SHIRT = "#2f3b47", SHIRT_D = "#243039";

// ---------- partes comuns ----------
const FACE = "M62 104 C62 72 78 54 100 54 C122 54 138 72 138 104 C138 134 131 156 118 169 C111 176 106 180 100 180 C94 180 89 176 82 169 C69 156 62 134 62 104 Z";

const SKULL = "M57 108 C55 68 75 46 100 46 C125 46 145 68 143 108 L140 130 L60 130 Z";

function base({ bg, hairBack = "", ears = true }) {
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.38" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${hairBack}
  <path d="M84 160 L84 200 L116 200 L116 160 Z" fill="${SKIN_D}"/>
  <path d="M10 ${H} C14 214 50 200 84 194 L100 214 L116 194 C150 200 186 214 190 ${H} Z" fill="${SHIRT}"/>
  <path d="M84 194 L100 214 L116 194 L112 190 L100 204 L88 190 Z" fill="${SHIRT_D}"/>
  ${ears ? `<ellipse cx="61" cy="118" rx="7" ry="13" fill="${SKIN_D}"/><ellipse cx="139" cy="118" rx="7" ry="13" fill="${SKIN_D}"/>` : ""}
  <path d="${SKULL}" fill="${SKIN}"/>
  <path d="${FACE}" fill="${SKIN}"/>`;
}

function features({ mouth = true } = {}) {
  return `
  <path d="M76 101 Q84 96 92 100" stroke="${HAIR}" stroke-width="3.6" fill="none" stroke-linecap="round"/>
  <path d="M108 100 Q116 96 124 101" stroke="${HAIR}" stroke-width="3.6" fill="none" stroke-linecap="round"/>
  <ellipse cx="84" cy="112" rx="4.2" ry="2.8" fill="#2a1f1a"/>
  <ellipse cx="116" cy="112" rx="4.2" ry="2.8" fill="#2a1f1a"/>
  <path d="M101 114 C100 124 97 131 95 135 C98 138 103 138 106 136" stroke="${SKIN_D}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  ${mouth ? `<path d="M90 152 Q100 157 110 152" stroke="${LIP}" stroke-width="3" fill="none" stroke-linecap="round"/>` : ""}`;
}

// boca por cima da barba (lábio aparecendo)
const MOUTH_OVER = `<path d="M89 151 Q100 147 111 151 Q100 158 89 151 Z" fill="${LIP}"/>`;

// ---------- cabelo ----------
// Laterais com degradê: `from` = onde começa a ficar escuro (y), quanto menor mais alto o degradê.
function sides(id, fadeTop, fadeBottom, opacity = 1, skin = false) {
  return `
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${HAIR}" stop-opacity="${opacity}"/>
    <stop offset="${fadeTop}" stop-color="${HAIR}" stop-opacity="${opacity * 0.85}"/>
    <stop offset="${fadeBottom}" stop-color="${skin ? SKIN : HAIR}" stop-opacity="${skin ? 0 : 0.12}"/>
    <stop offset="1" stop-color="${HAIR}" stop-opacity="0"/>
  </linearGradient><clipPath id="${id}k"><path d="${SKULL}"/></clipPath></defs>
  <g clip-path="url(#${id}k)">
  <path d="M50 60 L50 128 L66 128 C64 112 64 96 68 78 L68 60 Z" fill="url(#${id})"/>
  <path d="M150 60 L150 128 L134 128 C136 112 136 96 132 78 L132 60 Z" fill="url(#${id})"/></g>`;
}

let clipN = 0;
/** Desenha `d` com cor de cabelo e os detalhes `inner` recortados dentro dele. */
function top(d, inner = "", fill = HAIR, extra = "") {
  const id = `c${++clipN}`;
  return `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs><path d="${d}" fill="${fill}" ${extra}/><g clip-path="url(#${id})">${inner}</g>`;
}

const hair = {
  // máquina igual em tudo
  buzz: () => top("M58 106 C56 66 76 46 100 46 C124 46 144 66 142 106 L136 98 C134 84 124 74 100 74 C76 74 66 84 64 98 Z",
    dots(56, 44, 144, 106, 0.3), HAIR, 'opacity=".72"'),

  // social: curto em cima e nas laterais, penteado para o lado
  crew: () => `${sides("s1", 0.3, 0.9, 0.85)}` + top("M58 100 C54 60 76 40 100 40 C126 40 146 60 142 100 L136 90 C134 80 124 72 112 70 C96 68 82 70 72 78 C66 82 64 90 64 96 Z",
    `<path d="M70 62 Q100 46 132 58 M68 72 Q100 56 136 68" stroke="${HAIR_L}" stroke-width="2" fill="none" opacity=".6"/>`),

  "low-fade": () => `${sides("s2", 0.55, 0.95)}` + top("M56 92 C52 52 76 32 102 32 C128 32 148 52 144 92 L136 86 C134 76 126 70 114 70 C98 66 82 68 72 74 C64 78 62 86 64 92 Z",
    strands(64, 36, 136, 70)),

  "mid-fade": () => `${sides("s3", 0.25, 0.7)}` + top("M58 86 C54 48 78 30 102 30 C128 30 146 48 142 86 L136 80 C132 72 124 68 114 68 C98 64 84 66 74 72 C66 76 62 82 64 86 Z",
    strands(64, 34, 136, 68)),

  // navalhado: degradê alto até a pele, com risca
  "skin-fade": () => `${sides("s4", 0.1, 0.45, 0.9, true)}` + top("M60 80 C58 44 80 28 102 28 C126 28 144 44 140 80 L134 76 C130 70 122 66 112 66 C98 62 84 64 76 70 C68 74 64 78 64 80 Z",
    strands(84, 30, 136, 66) + `<path d="M86 28 C82 42 79 54 78 72" stroke="${SKIN}" stroke-width="1.8" fill="none"/>`),

  // topete alto penteado para trás
  pompadour: () => `${sides("s5", 0.3, 0.8)}` + top("M58 92 C54 58 64 30 92 18 C112 10 140 18 146 40 C148 54 144 70 142 92 L136 84 C134 76 126 72 114 72 C98 68 82 70 72 76 C64 80 62 86 64 92 Z",
    `<path d="M66 50 C84 26 112 18 140 30 M64 62 C84 38 114 30 144 42 M66 74 C86 52 116 44 146 54" stroke="${HAIR_L}" stroke-width="2.2" fill="none" opacity=".7"/>`),

  // social com risca lateral
  "side-part": () => `${sides("s6", 0.35, 0.85)}` + top("M56 100 C52 58 76 36 102 36 C128 36 148 56 144 100 L138 90 C136 80 128 74 116 72 C100 70 82 72 72 80 C64 84 62 92 62 98 Z",
    `<path d="M82 30 C79 46 78 60 80 76" stroke="${SKIN}" stroke-width="2" fill="none"/>` +
    `<path d="M84 46 C100 40 120 42 140 56 M84 58 C102 50 122 52 144 68 M60 70 C66 56 72 48 78 44" stroke="${HAIR_L}" stroke-width="2" fill="none" opacity=".7"/>`),

  // crop texturizado com franja
  "textured-crop": () => `${sides("s7", 0.3, 0.75)}` + top("M58 92 C54 54 76 36 102 36 C128 36 146 54 142 92 L136 86 C136 80 132 78 128 80 L122 76 L116 82 L110 76 L104 82 L98 76 L92 82 L86 76 L80 82 L74 78 C68 80 64 84 64 90 Z",
    strands(66, 40, 134, 82, 8)),

  // undercut: topo longo penteado para trás, laterais raspadas
  undercut: () => `${sides("s8", 0.05, 0.4, 0.45, true)}` + top("M60 78 C58 44 74 26 100 24 C126 22 144 40 142 78 L136 74 C130 68 120 66 110 66 C96 64 82 66 72 72 C66 74 62 76 60 78 Z",
    `<path d="M64 66 C72 44 96 30 130 32 M72 70 C82 50 104 40 140 44 M84 70 C94 56 114 50 144 56" stroke="${HAIR_L}" stroke-width="2.2" fill="none" opacity=".7"/>`),

  // cachos no topo com degradê
  "curly-top": () => `${sides("s9", 0.25, 0.7)}` +
    `<path d="M60 86 C56 56 74 40 100 40 C126 40 144 56 140 86 L132 78 L68 78 Z" fill="${HAIR}"/>` +
    curlRing(100, 60, 40, 22, 8),

  // black power (o volume fica atrás, aqui só a linha da testa)
  afro: () => top("M54 110 C50 60 72 38 100 38 C128 38 150 60 146 110 L138 100 C136 84 124 76 100 76 C76 76 64 84 62 100 Z", ""),

  // mullet moderno: curto em cima/laterais e comprido atrás
  mullet: () => `${sides("s10", 0.3, 0.75)}` + top("M58 96 C54 54 76 36 102 36 C128 36 146 54 142 96 L136 86 C134 78 128 74 120 76 L112 72 L104 78 L96 72 L88 78 L80 72 L72 78 C66 80 64 86 64 92 Z",
    strands(66, 40, 134, 78, 8)),
};
const hairBack = {
  mullet: `<path d="M60 110 C56 140 60 168 70 188 L86 182 C80 160 78 140 78 120 Z M140 110 C144 140 140 168 130 188 L114 182 C120 160 122 140 122 120 Z" fill="${HAIR}"/>`,
  afro: top("M36 82 A64 64 0 1 1 164 82 A64 64 0 1 1 36 82 Z", curls(30, 10, 170, 150, 10, 0.4)),
};

function dots(x1, y1, x2, y2, op) {
  let s = "";
  for (let y = y1; y < y2; y += 5) for (let x = x1 + ((y / 5) % 2) * 2.5; x < x2; x += 5) {
    const dx = (x - 100) / 44, dy = (y - 80) / 36;
    if (dx * dx + dy * dy < 1.1) s += `<circle cx="${x.toFixed(1)}" cy="${y}" r=".9" fill="#000" opacity="${op}"/>`;
  }
  return s;
}

/** Cachos em anel: círculos com miolo, cobrindo uma elipse (cx, cy, rx, ry). */
function curlRing(cx, cy, rx, ry, r) {
  let s = "";
  for (let y = cy - ry; y <= cy + ry * 0.9; y += r * 1.2) {
    for (let x = cx - rx; x <= cx + rx; x += r * 1.3) {
      const xx = x + ((Math.round((y - cy) / (r * 1.2)) % 2) * r * 0.65);
      const dx = (xx - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      s += `<circle cx="${xx.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${HAIR}"/><path d="M${(xx - r * 0.5).toFixed(1)} ${(y + r * 0.1).toFixed(1)} a${r * 0.5} ${r * 0.5} 0 1 1 ${r * 0.7} ${r * 0.35}" stroke="${HAIR_L}" stroke-width="1.5" fill="none" opacity=".75"/>`;
    }
  }
  return s;
}

function strands(x1, y1, x2, y2, step = 12) {
  let s = "";
  for (let x = x1; x <= x2; x += step) {
    s += `<path d="M${x} ${y2} C${x + 2} ${y2 - 12} ${x + 6} ${y1 + 10} ${x + 10} ${y1}" stroke="${HAIR_L}" stroke-width="1.6" fill="none" opacity=".55" stroke-linecap="round"/>`;
  }
  return s;
}

function curls(x1, y1, x2, y2, r, op = 1) {
  let s = "";
  let row = 0;
  for (let y = y1 + r; y <= y2; y += r * 1.35, row++) {
    for (let x = x1 + r + (row % 2) * r; x <= x2 - r * 0.5; x += r * 1.7) {
      const cx = (x1 + x2) / 2, rx = (x2 - x1) / 2, ry = (y2 - y1) / 1.2;
      const dx = (x - cx) / rx, dy = (y - y2) / ry;
      if (dx * dx + dy * dy > 1.05) continue;
      s += op < 1
        ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r * 0.55}" fill="none" stroke="${HAIR_L}" stroke-width="1.6" opacity="${op}"/>`
        : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${HAIR}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r * 0.45}" fill="none" stroke="${HAIR_L}" stroke-width="1.4" opacity=".7"/>`;
    }
  }
  return s;
}

// ---------- barba ----------
const BEARD_FULL = "M62 112 C62 146 72 172 86 184 C92 189 96 191 100 191 C104 191 108 189 114 184 C128 172 138 146 138 112 L132 114 C131 128 128 138 120 142 C112 145 106 143 100 143 C94 143 88 145 80 142 C72 138 69 128 68 114 Z";
const MUSTACHE = "M84 147 C88 140 96 139 100 142 C104 139 112 140 116 147 C110 146 104 147 100 149 C96 147 90 146 84 147 Z";

const beardHair = `
  <path d="M60 98 C56 58 78 38 102 38 C128 38 146 58 140 98 L136 90 C134 80 126 74 114 72 C98 68 82 70 72 78 C64 82 62 90 64 96 Z" fill="${HAIR}"/>
  ${sides("bh", 0.35, 0.85)}`;

const beard = {
  stubble: () => `
  ${top(BEARD_FULL, dotsIn(60, 108, 140, 192, 0.4), HAIR, 'opacity=".2"')}
  <path d="${MUSTACHE}" fill="${HAIR}" opacity=".3"/>
  <path d="M90 152 Q100 157 110 152" stroke="${LIP}" stroke-width="3" fill="none" stroke-linecap="round"/>`,

  // barba curta e desenhada (contorno marcado)
  short: () => `
  <path d="M64 116 C64 146 74 168 88 178 C93 182 97 183 100 183 C103 183 107 182 112 178 C126 168 136 146 136 116 L130 118 C130 130 126 138 118 141 C112 143 106 142 100 142 C94 142 88 143 82 141 C74 138 70 130 70 118 Z" fill="${HAIR}" opacity=".9"/>
  <path d="${MUSTACHE}" fill="${HAIR}"/>
  ${MOUTH_OVER}`,

  full: () => `
  <path d="${BEARD_FULL}" fill="${HAIR}"/>
  <path d="M80 160 C86 176 94 184 100 186 M120 160 C114 176 106 184 100 186 M72 140 C76 160 84 172 92 180 M128 140 C124 160 116 172 108 180" stroke="${HAIR_L}" stroke-width="1.5" fill="none" opacity=".6"/>
  <path d="M82 148 C86 139 96 138 100 141 C104 138 114 139 118 148 C110 146 104 148 100 150 C96 148 90 146 82 148 Z" fill="${HAIR}"/>
  ${MOUTH_OVER}`,

  // lenhador: longa e volumosa
  long: () => `
  <path d="M60 110 C58 150 66 196 84 218 C90 224 96 226 100 226 C104 226 110 224 116 218 C134 196 142 150 140 110 L132 114 C131 128 128 138 120 142 C112 145 106 143 100 143 C94 143 88 145 80 142 C72 138 69 128 68 114 Z" fill="${HAIR}"/>
  <path d="M80 160 C84 190 92 210 100 220 M120 160 C116 190 108 210 100 220 M70 140 C72 170 80 196 90 212 M130 140 C128 170 120 196 110 212" stroke="${HAIR_L}" stroke-width="1.6" fill="none" opacity=".6"/>
  <path d="M80 149 C86 138 96 137 100 141 C104 137 114 138 120 149 C110 146 104 148 100 151 C96 148 90 146 80 149 Z" fill="${HAIR}"/>
  ${MOUTH_OVER}`,

  // cavanhaque: queixo + bigode ligados
  goatee: () => `
  <path d="M84 148 C84 160 86 176 92 182 C96 185 104 185 108 182 C114 176 116 160 116 148 C112 156 108 160 100 160 C92 160 88 156 84 148 Z" fill="${HAIR}"/>
  <path d="${MUSTACHE}" fill="${HAIR}"/>
  ${MOUTH_OVER}`,

  // van dyke: bigode separado do queixo
  "van-dyke": () => `
  <path d="M90 162 C90 172 94 186 100 190 C106 186 110 172 110 162 C106 165 94 165 90 162 Z" fill="${HAIR}"/>
  <path d="M80 148 C84 140 94 138 100 142 C106 138 116 140 120 148 C116 145 110 145 100 148 C90 145 84 145 80 148 Z" fill="${HAIR}"/>
  ${MOUTH_OVER}`,

  // bigode grosso, rosto liso
  mustache: () => `
  <path d="M78 150 C82 138 94 136 100 141 C106 136 118 138 122 150 C116 146 108 146 100 149 C92 146 84 146 78 150 Z" fill="${HAIR}"/>
  <path d="M90 154 Q100 158 110 154" stroke="${LIP}" stroke-width="3" fill="none" stroke-linecap="round"/>`,

  // barba com degradê nas costeletas
  "fade-beard": () => `
  <defs><linearGradient id="bf" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${HAIR}" stop-opacity="0"/><stop offset=".3" stop-color="${HAIR}" stop-opacity=".5"/><stop offset=".55" stop-color="${HAIR}" stop-opacity="1"/>
  </linearGradient></defs>
  <path d="${BEARD_FULL}" fill="url(#bf)" transform="translate(0 0)"/>
  <path d="M82 148 C86 139 96 138 100 141 C104 138 114 139 118 148 C110 146 104 148 100 150 C96 148 90 146 82 148 Z" fill="${HAIR}"/>
  ${MOUTH_OVER}`,
};

function dotsIn(x1, y1, x2, y2, op) {
  let s = "";
  for (let y = y1; y < y2; y += 3.4) for (let x = x1 + ((y * 7) % 3); x < x2; x += 3.4) {
    const nearMouth = Math.abs(x - 100) < 12 && y > 147 && y < 157;
    if (!nearMouth) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".75" fill="${HAIR}" opacity="${op}"/>`;
  }
  return s;
}

// ---------- montagem ----------
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>\n`;
const CUT_BG = ["#f4e9dc", "#e2cdb3"];
const BEARD_BG = ["#e3ebf0", "#c3d1db"];

fs.mkdirSync("public/galeria", { recursive: true });
const out = [];
for (const [k, f] of Object.entries(hair)) {
  const body = base({ bg: CUT_BG, hairBack: hairBack[k] ?? "", }) + features() + f();
  out.push([`corte-${k}`, svg(body)]);
}
for (const [k, f] of Object.entries(beard)) {
  const body = base({ bg: BEARD_BG }) + features({ mouth: false }) + beardHair + f();
  out.push([`barba-${k}`, svg(body)]);
}
for (const [name, s] of out) fs.writeFileSync(`public/galeria/${name}.svg`, s.replace(/\n\s*/g, ""));
console.log(`ok ${out.length} desenhos em public/galeria`);
