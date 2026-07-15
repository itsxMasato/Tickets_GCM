// Try to parse in chunks delimited by complete function definitions.
import { readFileSync, writeFileSync } from 'fs';
import { transformSync } from '/C:/Users/flore/OneDrive/Desktop/Tickets_GCM/node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/lib/main.js';
const src = readFileSync('client/components/topbar.js', 'utf8');
// Wrap: place all imports in comments, then add dummy export
const stripped = src.replace(/^import .+$/gm, '// $&');
const wrapped = stripped + '\nexport const _ = 1;';
// Try parsing prefixes of length 200..max step 50
const tryP = (s) => { try { transformSync(s, { loader: 'js' }); return null; } catch (e) { return e.errors?.[0]?.text; } };
let bad = -1, badErr = null;
for (let i = 200; i <= wrapped.length; i += 50) {
  const err = tryP(wrapped.slice(0, i));
  if (err) { bad = i; badErr = err; break; }
}
console.log('first bad at', bad, ':', badErr);
if (bad > 0) {
  console.log('context:');
  console.log(wrapped.slice(Math.max(0, bad-200), bad+100));
}
