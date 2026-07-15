// Real template-literal balance tracker.
import { readFileSync } from 'fs';
const src = readFileSync('client/components/topbar.js', 'utf8');
let inS = null;          // ' " or `
let inLC = false;        // // line comment
let inBC = false;        // /* */ block comment
let inRegex = false;
let templateDepth = 0;
let i = 0;
let line = 1, col = 0;
const events = [];
function push(ev) { events.push({ ...ev, line, col, idx: i }); }
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
    if (c === inS) { push({ kind: 'close', ch: inS }); inS = null; i++; continue; }
    i++; continue;
  }
  // Outside string
  if (c === '/' && n === '/') { inLC = true; i += 2; col++; continue; }
  if (c === '/' && n === '*') { inBC = true; i += 2; col++; continue; }
  if (c === '"' || c === "'" || c === '`') {
    inS = c;
    push({ kind: 'open', ch: c });
    i++; continue;
  }
  i++;
}
console.log('Still open at EOF:', inS);
console.log('Total open events:', events.filter(e => e.kind === 'open').length);
console.log('Total close events:', events.filter(e => e.kind === 'close').length);
// Find first open without matching close
let stack = [];
for (const ev of events) {
  if (ev.kind === 'open') stack.push(ev);
  else stack.pop();
}
if (stack.length) {
  console.log('UNCLOSED templates:');
  for (const ev of stack) console.log(`  \`${ev.ch}\` opened at line ${ev.line} col ${ev.col} (char ${ev.idx})`);
} else {
  console.log('All templates balanced.');
}
