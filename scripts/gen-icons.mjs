// 의존성 없이 PWA 아이콘 PNG(192·512)를 만든다. 파란 바탕에 흰 3x3 판.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size) {
  const BG = [0x2f, 0x5b, 0xd3];
  const WHITE = [0xff, 0xff, 0xff];
  const LINE = [0x1c, 0x22, 0x33];
  const HL = [0xff, 0xd6, 0x66];
  const inset = Math.round(size * 0.2);
  const boardSize = size - inset * 2;
  const cell = boardSize / 9;
  const thick = Math.max(2, Math.round(size / 64));
  const thin = Math.max(1, Math.round(size / 256));
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let px = BG;
      const bx = x - inset;
      const by = y - inset;
      if (bx >= 0 && by >= 0 && bx < boardSize && by < boardSize) {
        px = WHITE;
        const cx = Math.floor(bx / cell);
        const cy = Math.floor(by / cell);
        if ((cx === 4 && cy === 4) || (cx === 1 && cy === 6) || (cx === 7 && cy === 2)) px = HL;
        for (let k = 0; k <= 9; k++) {
          const pos = Math.round(k * cell);
          const w = k % 3 === 0 ? thick : thin;
          if (Math.abs(bx - pos) < w || Math.abs(by - pos) < w) px = LINE;
        }
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = px[0];
      raw[o + 1] = px[1];
      raw[o + 2] = px[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), icon(size));
}
console.log('icons written');
