/**
 * Verifies the pure-JS SHA-256 fallback in `src/contexts/AuthContext.tsx`
 * (used when `crypto.subtle` is unavailable) against Node's built-in
 * implementation on known FIPS 180-4 test vectors + random inputs.
 *
 * Run: node scripts/sha256-fallback.test.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/contexts/AuthContext.tsx'),
  'utf8',
);

// Extract the function source (strip the TS type annotations it has).
const start = src.indexOf('function sha256FallbackHex');
if (start === -1) throw new Error('sha256FallbackHex not found in AuthContext.tsx');
const end = src.indexOf('\n}\n', start);
let fnSrc = src.slice(start, end + 3);
// Strip the TS annotations this function carries (params/returns/types).
fnSrc = fnSrc
  .replace('(data: Uint8Array): string', '(data)')
  .replace('(x: number, n: number)', '(x, n)');

const factory = new Function(`
  ${fnSrc}
  return sha256FallbackHex;
`);
const sha256FallbackHex = factory();

const nodeSha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const enc = new TextEncoder();
const cases = [
  new Uint8Array(0),                       // empty
  enc.encode('abc'),                       // FIPS 180-4 vector
  enc.encode('The quick brown fox jumps over the lazy dog'),
  enc.encode('a'.repeat(55)),             // single-block boundary
  enc.encode('a'.repeat(64)),             // two blocks
  enc.encode('a'.repeat(65)),
  enc.encode('x'.repeat(1024)),
];
const random = crypto.getRandomValues(new Uint8Array(4096));
cases.push(random);

let failed = 0;
for (const input of cases) {
  const expected = nodeSha256(Buffer.from(input));
  const actual = sha256FallbackHex(input);
  const ok = expected === actual;
  if (!ok) failed++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} len=${input.length} expected=${expected.slice(0, 16)}... actual=${actual.slice(0, 16)}...`,
  );
}
// FIPS known answers
const known = {
  '': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  abc: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
};
for (const [text, want] of Object.entries(known)) {
  const got = sha256FallbackHex(text ? enc.encode(text) : new Uint8Array(0));
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} vector "${text}" ${got === want ? '' : `\n  want ${want}\n  got  ${got}`}`);
}

if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log('\nAll SHA-256 fallback checks passed.');
