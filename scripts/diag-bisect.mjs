// Use esbuild parser on chunks that go from end to start
import { readFileSync } from 'fs';
import { transformSync } from '/C:/Users/flore/OneDrive/Desktop/Tickets_GCM/node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/lib/main.js';
const src = readFileSync('client/components/topbar.js', 'utf8');
const stripped = src.replace(/^import .+$/gm, '// $&');
const wrapped = stripped + '\nexport const _ = 1;';
const tryP = (s) => { try { transformSync(s, { loader: 'js' }); return null; } catch (e) { return e.errors?.[0]; } };
// Try removing 100 chars at a time from start
let startRemove = 0;
let last = null;
for (let step = 100; step <= wrapped.length; step += 100) {
  const s = wrapped.slice(step);
  const err = tryP(s);
  if (err) { last = { step, err }; }
}
console.log('last failure at startRemove:', last?.step, 'err:', last?.err?.text);
// Now binary search within last 100
let lo = last.step - 100, hi = last.step;
while (hi - lo > 5) {
  const mid = (lo + hi) >> 1;
  const s = wrapped.slice(mid);
  const err = tryP(s);
  if (err) hi = mid; else lo = mid;
}
console.log('failure at startRemove between', lo, 'and', hi);
console.log('context (removing', hi, 'chars from start):');
console.log(wrapped.slice(Math.max(0, hi-50), Math.min(wrapped.length, hi+200)));
