/**
 * Gerador mínimo de QR code (modo byte, correção de erro nível M, versões 1 a 10).
 * Cabe um link de até 213 bytes, mais que suficiente para o link de agendamento.
 * Segue a norma ISO/IEC 18004. Sem dependências: roda no servidor e no navegador.
 */

export interface QrCode {
  /** Lado em módulos (sem a margem branca). */
  size: number;
  version: number;
  mask: number;
  /** modules[y][x] = true é quadradinho escuro. */
  modules: boolean[][];
}

// nível M: [códigos de correção por bloco, [blocos, bytes de dados por bloco][]]
const BLOCKS_M: [number, [number, number][]][] = [
  [10, [[1, 16]]],
  [16, [[1, 28]]],
  [26, [[1, 44]]],
  [18, [[2, 32]]],
  [24, [[2, 43]]],
  [16, [[4, 27]]],
  [18, [[4, 31]]],
  [22, [[2, 38], [2, 39]]],
  [22, [[3, 36], [2, 37]]],
  [26, [[4, 43], [1, 44]]],
];
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const FORMAT_M = 0; // bits do nível M no campo de formato

const dataCapacity = (v: number) => BLOCKS_M[v - 1][1].reduce((t, [n, d]) => t + n * d, 0);
const countBits = (v: number) => (v < 10 ? 8 : 16);

/** Maior quantidade de bytes que cabe. */
export const QR_MAX_BYTES = (dataCapacity(10) * 8 - 4 - countBits(10)) >> 3;

function gfMul(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number) {
  const out = new Array<number>(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 2);
  }
  return out;
}

/** Códigos de correção Reed-Solomon de um bloco. */
export function rsRemainder(data: number[], degree: number) {
  const div = rsDivisor(degree);
  const out = new Array<number>(degree).fill(0);
  for (const b of data) {
    const f = b ^ out.shift()!;
    out.push(0);
    div.forEach((c, i) => (out[i] ^= gfMul(c, f)));
  }
  return out;
}

function encodeData(bytes: Uint8Array, v: number) {
  const cap = dataCapacity(v) * 8;
  const bits: number[] = [];
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, countBits(v));
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((t, b) => (t << 1) | b, 0));

  const [ec, groups] = BLOCKS_M[v - 1];
  const blocks: number[][] = [];
  let k = 0;
  for (const [n, len] of groups) for (let i = 0; i < n; i++) { blocks.push(words.slice(k, k + len)); k += len; }
  const ecBlocks = blocks.map((b) => rsRemainder(b, ec));
  const out: number[] = [];
  const maxLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(codewords: number[], v: number, mask: number) {
  const size = v * 4 + 17;
  const m = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { m[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[v - 1];
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  // formato (nível + máscara), com correção BCH
  const fmt = (FORMAT_M << 3) | mask;
  let rem = fmt;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fbits = ((fmt << 10) | rem) ^ 0x5412;
  const fb = (i: number) => ((fbits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, fb(i));
  set(8, 7, fb(6)); set(8, 8, fb(7)); set(7, 8, fb(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, fb(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, fb(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, fb(i));
  set(8, size - 8, true);

  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const vbits = (v << 12) | r;
    for (let i = 0; i < 18; i++) {
      const dark = ((vbits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, dark); set(b, a, dark);
    }
  }

  // dados em zigue-zague, de baixo para cima, duas colunas por vez
  let i = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (fn[y][x]) continue;
      const bit = i < total ? ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
      i++;
      m[y][x] = bit !== MASKS[mask](x, y);
    }
  }
  return m;
}

/** Pontuação de "feiura" da norma: quanto menor, mais fácil a câmera ler. */
export function penalty(m: boolean[][]) {
  const n = m.length;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    const pat = [true, false, true, true, true, false, true];
    for (let i = 0; i + 7 <= n; i++) {
      if (!pat.every((p, k) => get(i + k) === p)) continue;
      const light = (from: number) => [0, 1, 2, 3].every((k) => from + k < 0 || from + k >= n || !get(from + k));
      if (light(i - 4)) score += 40;
      if (light(i + 7)) score += 40;
    }
  };
  for (let y = 0; y < n; y++) line((x) => m[y][x]);
  for (let x = 0; x < n; x++) line((y) => m[y][x]);
  let dark = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) dark++;
    if (y + 1 < n && x + 1 < n && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  }
  score += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return score;
}

/** Gera o QR code de um texto (ex.: um link). `mask` força a máscara (para testes). */
export function qrEncode(text: string, opts: { mask?: number } = {}): QrCode {
  const bytes = new TextEncoder().encode(text);
  let v = 1;
  while (v <= 10 && 4 + countBits(v) + bytes.length * 8 > dataCapacity(v) * 8) v++;
  if (v > 10) throw new Error(`texto longo demais para o QR (máx. ${QR_MAX_BYTES} bytes)`);
  const words = encodeData(bytes, v);
  const masks = opts.mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [opts.mask];
  let best: QrCode | null = null;
  let bestScore = Infinity;
  for (const mask of masks) {
    const modules = build(words, v, mask);
    const s = masks.length > 1 ? penalty(modules) : 0;
    if (s < bestScore) { bestScore = s; best = { size: modules.length, version: v, mask, modules }; }
  }
  return best!;
}

/** Caminho SVG (um quadrado 1x1 por módulo escuro), já com a margem branca `quiet`. */
export function qrSvgPath(qr: QrCode, quiet = 4) {
  let d = "";
  qr.modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
  return { d, viewBox: `0 0 ${qr.size + quiet * 2} ${qr.size + quiet * 2}` };
}
