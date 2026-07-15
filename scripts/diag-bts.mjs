// Simpler: just walk and report every backtick position with context.
import { readFileSync } from 'fs';
const src = readFileSync('client/components/topbar.js', 'utf8');
let mode = 'code';
let sChar = null;
let tplDepth = 0; // how many nested ${} we're inside
let i = 0, line = 1, col = 0;
const bts = [];

while (i < src.length) {
  const c = src[i];
  const n = src[i+1] ?? '';
  col++;
  if (c === '\n') { line++; col = 0; i++; continue; }
  if (mode === 'lc') { if (c === '\n') mode = 'code'; i++; continue; }
  if (mode === 'bc') { if (c === '*' && n === '/') { mode = 'code'; i += 2; col++; continue; } i++; continue; }
  if (mode === 's') {
    if (c === '\\') { i += 2; col++; continue; }
    if (c === sChar) {
      mode = tplDepth > 0 ? 'code' : 'code'; // back to code either way
      sChar = null;
      i++; continue;
    }
    i++; continue;
  }
  // code mode
  if (c === '/' && n === '/') { mode = 'lc'; i += 2; col++; continue; }
  if (c === '/' && n === '*') { mode = 'bc'; i += 2; col++; continue; }
  if (c === '"' || c === "'") { sChar = c; mode = 's'; i++; continue; }
  if (c === '`') { bts.push({ line, col, idx: i, tplDepth }); i++; continue; }
  i++;
}
console.log('total backticks outside strings/comments:', bts.length);
for (let k = 0; k < bts.length; k++) {
  console.log(`  #${k+1} line ${bts[k].line} col ${bts[k].col} idx ${bts[k].idx} tplDepth ${bts[k].tplDepth}`);
  // Show 30 chars of context
  const ctx = src.slice(Math.max(0, bts[k].idx-10), Math.min(src.length, bts[k].idx+30));
  console.log(`    ...${ctx}...`);
}
