#!/usr/bin/env node
'use strict';
/*
 * 앱 아이콘 생성기 (외부 라이브러리 없음)
 * 사용법:  node tools/make-icons.js   →  icons/icon-180.png, icon-192.png, icon-512.png
 * 64×64 픽셀아트를 그린 뒤 최근접 보간으로 확대해 PNG로 저장합니다.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const G = 64;
const px = new Array(G * G);

function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function set(x, y, c) { if (x >= 0 && y >= 0 && x < G && y < G) px[y * G + x] = hex(c); }
function mirror(rows) { return rows.map((r) => r + r.slice(0, -1).split('').reverse().join('')); }
function blit(rows, pal, ox, oy, s) {
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (!pal[ch]) return;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) set(ox + x * s + dx, oy + y * s + dy, pal[ch]);
  }));
}

// 배경: 남색 → 보라 세로 그라데이션
for (let y = 0; y < G; y++) {
  const t = y / (G - 1);
  const c = [Math.round(6 + 40 * t), Math.round(6 + 6 * t), Math.round(32 + 50 * t)];
  for (let x = 0; x < G; x++) px[y * G + x] = c;
}
// 별
[[6, 8, '#ffffff'], [55, 12, '#5ef2ff'], [12, 40, '#ffe14a'], [50, 46, '#ffffff'], [30, 5, '#ff8ad8'], [58, 30, '#ffffff'], [4, 56, '#9fb0ff'], [44, 58, '#ffe14a']]
  .forEach(([x, y, c]) => set(x, y, c));

// 적(일반형) — 위쪽
const GRUNT = mirror(['..Y...', '...Y..', '..GGGG', '.GGWGG', 'GGGKGG', 'G.GGGG', 'G.G...', '...GG.']);
blit(GRUNT, { G: '#38d86b', Y: '#ffe14a', W: '#ffffff', K: '#14143a' }, 21, 4, 2);

// 아군 탄
for (let y = 21; y < 25; y++) { set(31, y, '#5ef2ff'); set(32, y, '#ffffff'); }

// 플레이어 기체 — 아래쪽 (13×12, 3배)
const SHIP = [
  '......W......', '......W......', '.....WCW.....', '.....WCW.....', '....WWCWW....', '..R.WBBBW.R..',
  '..R.WBWBW.R..', '.RWWWWWWWWWR.', 'RWWBWWWWWBWWR', 'RW.BWWRWWB.WR', 'R...WRRRW...R', '....R...R....',
];
blit(SHIP, { W: '#f4f4ff', B: '#3a7bff', C: '#5ef2ff', R: '#ff3b4e' }, 13, 27, 3);

// ---- PNG 인코더 ----
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    const gy = Math.floor((y * G) / size);
    for (let x = 0; x < size; x++) {
      const c = px[gy * G + Math.floor((x * G) / size)];
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8bit RGB (불투명: iOS 아이콘은 투명 영역이 검게 보이므로)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const s of [180, 192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${s}.png`), png(s));
  console.log(`icons/icon-${s}.png`);
}
