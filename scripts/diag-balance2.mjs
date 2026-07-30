/* Documentado por: Miguel Flores */
import { readFileSync } from 'fs';
const src = readFileSync('client/components/topbar.js', 'utf8');
let inS = null, inLC = false, inBC = false;
let i = 0, line = 1, col = 0;
const events = [];
while (i < src.length) {
  const c = src[i];
  const n = src[i+1] ?? '';
  if (c === '\n') { line++; col = 0; inLC = false; i++; continue; }
  col++;
  if (inLC) { i++; continue; }
  if (inBC) {
    if (c === '*' && n === '/') { inBC = false; i += 2; col++; continue; }
    i++; continue;
  }
  if (inS) {
    if (c === '\\') { i += 2; col++; continue; }
    if (c === inS) { events.push({ kind: 'close', ch: inS, line, col, idx: i }); inS = null; i++; continue; }
    i++; continue;
  }
  if (c === '/' && n === '/') { inLC = true; i += 2; col++; continue; }
  if (c === '/' && n === '*') { inBC = true; i += 2; col++; continue; }
  if (c === '"' || c === "'" || c === '`') {
    events.push({ kind: 'open', ch: c, line, col, idx: i });
    inS = c; i++; continue;
  }
  i++;
}
console.log('Last 5 events:');
for (const ev of events.slice(-5))
  console.log(JSON.stringify(ev));
console.log('Events near line 527:');
for (const ev of events) {
  if (ev.line >= 520 && ev.line <= 530) console.log(JSON.stringify(ev));
}

