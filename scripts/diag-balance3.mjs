/* Documentado por: Miguel Flores */
import { readFileSync } from 'fs';
const src = readFileSync('client/components/topbar.js', 'utf8');
let mode = 'code';
let sChar = null;
let depth = 0;
let i = 0;
let line = 1, col = 0;
const events = [];

function step() { line++; col = 0; }
function here() { return { line, col, idx: i, ch: src[i] }; }

while (i < src.length) {
  const c = src[i];
  const n = src[i+1] ?? '';
  col++;
  if (c === '\n') { step(); i++; continue; }

  if (mode === 'lc') { if (c === '\n') { mode = 'code'; } i++; continue; }
  if (mode === 'bc') { if (c === '*' && n === '/') { mode = 'code'; i += 2; col++; continue; } i++; continue; }

  if (mode === 'template') {
    if (c === '\\') { i += 2; col++; continue; }
    if (c === '`') { events.push({ kind: 'tpl_close', ...here() }); mode = 'code'; i++; continue; }
    if (c === '$' && n === '{') { depth = 1; mode = 'code'; events.push({ kind: 'tpl_interp_open', ...here() }); i += 2; col++; continue; }
    i++; continue;
  }

  if (mode === 's') {
    if (c === '\\') { i += 2; col++; continue; }
    if (c === sChar) { mode = depth > 0 ? 'template' : 'code'; sChar = null; i++; continue; }
    if (sChar === '`') {
      if (c === '$' && n === '{')
        { depth++; i += 2; col++; continue; }
      if (c === '}') { depth--; mode = 'template'; i++; continue; }
    }
    i++; continue;
  }

  if (c === '/' && n === '/')
    { mode = 'lc'; i += 2; col++; continue; }
  if (c === '/' && n === '*') { mode = 'bc'; i += 2; col++; continue; }
  if (c === '"' || c === "'") { sChar = c; mode = 's'; i++; continue; }
  if (c === '`') { sChar = '`'; mode = 's'; events.push({ kind: 'tpl_open', ...here() }); i++; continue; }
  i++;
}

console.log('Final mode:', mode, 'sChar:', sChar, 'depth:', depth);
console.log('Template open events:', events.filter(e => e.kind === 'tpl_open').length);
console.log('Template close events:', events.filter(e => e.kind === 'tpl_close').length);

let stack = [];
for (const ev of events) {
  if (ev.kind === 'tpl_open') stack.push(ev);
  else if (ev.kind === 'tpl_close') stack.pop();
}
if (stack.length) {
  console.log('UNCLOSED templates:');
  for (const ev of stack) console.log(`  line ${ev.line} col ${ev.col} (idx ${ev.idx})`);
} else {
  console.log('All balanced.');
}

