// Tiny stack VM for tiny-stack-vm-01-run-20261122.
// Runs every instance in /input and writes stdout.bin + exit.txt per instance.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const STEP_LIMIT = 1000000;
const OUTPUT_MAX = 65536;
const pops = new Uint8Array(256).fill(255);
const pushes = new Uint8Array(256);
const immediates = new Uint8Array(256);
for (const [op, pop, push, imm = 0] of [
  [0x00,0,0],[0x01,0,1,1],[0x02,0,1,4],[0x03,1,0],[0x04,1,2],[0x05,2,2],
  [0x06,2,3],[0x07,3,3],[0x10,2,1],[0x11,2,1],[0x12,2,1],[0x13,2,1],
  [0x14,2,1],[0x15,2,1],[0x16,2,1],[0x17,1,1],[0x18,2,1],[0x19,2,1],
  [0x1a,2,1],[0x1b,1,1],[0x1c,2,1],[0x1d,2,1],[0x1e,2,1],[0x20,2,1],
  [0x21,2,1],[0x22,2,1],[0x30,0,0,2],[0x31,1,0,2],[0x32,1,0,2],
  [0x33,0,0,2],[0x34,0,0],[0x40,1,1],[0x41,2,0],[0x50,1,0],[0x51,1,0],
  [0x52,0,1],[0x53,1,0],
]) {
  pops[op] = pop;
  pushes[op] = push;
  immediates[op] = imm;
}

function run(P, input) {
  const D = new Int32Array(256), C = new Uint16Array(64), M = new Int32Array(256);
  const out = Buffer.allocUnsafe(OUTPUT_MAX);
  let sp = 0, csp = 0, olen = 0, inPos = 0, pc = 0, steps = 0, exit = 9;
  for (;;) {
    if (steps === STEP_LIMIT) { exit = 10; break; }
    if (pc < 0 || pc >= P.length) { exit = 9; break; }
    const op = P[pc], imm = immediates[op], pop = pops[op];
    if (pop === 255) { exit = 5; break; }
    if (pc + imm >= P.length) { exit = 9; break; }
    steps++;
    const next = pc + 1 + imm;
    if (sp < pop) { exit = 2; break; }
    if (sp - pop + pushes[op] > 256) { exit = 3; break; }
    pc = next;
    switch (op) {
      case 0x00: exit = 0; return { out: out.subarray(0, olen), exit };
      case 0x01: D[sp++] = (P[next - 1] << 24) >> 24; break;
      case 0x02: D[sp++] = P[next - 4] | (P[next - 3] << 8) | (P[next - 2] << 16) | (P[next - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
      case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
      case 0x1e: case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1], a = D[sp - 2];
        let r;
        switch (op) {
          case 0x10: r = a + b | 0; break;
          case 0x11: r = a - b | 0; break;
          case 0x12: r = Math.imul(a, b); break;
          case 0x13: if (!b) { exit = 4; return { out: out.subarray(0, olen), exit }; } r = a === -2147483648 && b === -1 ? a : a / b | 0; break;
          case 0x14: if (!b) { exit = 4; return { out: out.subarray(0, olen), exit }; } r = b === -1 ? 0 : a % b | 0; break;
          case 0x15: if (!b) { exit = 4; return { out: out.subarray(0, olen), exit }; } r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 0x16: if (!b) { exit = 4; return { out: out.subarray(0, olen), exit }; } r = (a >>> 0) % (b >>> 0) | 0; break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break;
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = a >>> (b & 31) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          case 0x22: r = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
        }
        sp -= 2; D[sp++] = r; break;
      }
      case 0x30: case 0x31: case 0x32: {
        let rel = P[next - 2] | (P[next - 1] << 8);
        rel = (rel << 16) >> 16;
        const take = op === 0x30 || (op === 0x31 ? D[--sp] === 0 : D[--sp] !== 0);
        if (take) pc = next + rel;
        break;
      }
      case 0x33:
        if (csp === 64) { exit = 7; return { out: out.subarray(0, olen), exit }; }
        C[csp++] = next; pc = P[next - 2] | (P[next - 1] << 8); break;
      case 0x34:
        if (!csp) { exit = 8; return { out: out.subarray(0, olen), exit }; }
        pc = C[--csp]; break;
      case 0x40: {
        const addr = D[sp - 1];
        if (addr < 0 || addr >= 256) { exit = 6; return { out: out.subarray(0, olen), exit }; }
        D[sp - 1] = M[addr]; break;
      }
      case 0x41: {
        const addr = D[sp - 1], v = D[sp - 2];
        if (addr < 0 || addr >= 256) { exit = 6; return { out: out.subarray(0, olen), exit }; }
        sp -= 2; M[addr] = v; break;
      }
      case 0x50: {
        const s = String(D[sp - 1]);
        if (olen + s.length > OUTPUT_MAX) { exit = 11; return { out: out.subarray(0, olen), exit }; }
        for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
        sp--; break;
      }
      case 0x51:
        if (olen === OUTPUT_MAX) { exit = 11; return { out: out.subarray(0, olen), exit }; }
        out[olen++] = D[--sp] & 255; break;
      case 0x52: D[sp++] = inPos < input.length ? input[inPos++] : -1; break;
      case 0x53: return { out: out.subarray(0, olen), exit: D[--sp] & 255 };
    }
  }
  return { out: out.subarray(0, olen), exit };
}

for (const id of readdirSync(I).sort()) {
  const dir = join(I, id);
  const result = run(readFileSync(join(dir, 'program.bin')), readFileSync(join(dir, 'input.bin')));
  const dest = join(O, id);
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'stdout.bin'), result.out);
  writeFileSync(join(dest, 'exit.txt'), `${result.exit}\n`);
}
