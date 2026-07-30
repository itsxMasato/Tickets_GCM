/* Documentado por: Miguel Flores */
const fs = require('fs');
const src = fs.readFileSync('client/components/topbar.js', 'utf8');
let inS = null, inT = false, inLC = false, inBC = false;
let i = 0;
let btOutside = 0;
let lastBtLine = -1;
let line = 1;
while (i < src.length) {
  const c = src[i], n = src[i+1];
  if (c === '\n') line++;
  if (inLC) { if (c === '\n') inLC = false; i++; continue; }
  if (inBC) { if (c === '*' && n === '/') { inBC = false; i+=2; continue; } i++; continue; }
  if (inS) { if (c === '\\') { i+=2; continue; } if (c === inS) inS = null; i++; continue; }
  if (inT) { if (c === '\\') { i+=2; continue; } if (c === '`') { inT = false; } i++; continue; }
  if (c === '/' && n === '/') { inLC = true; i+=2; continue; }
  if (c === '/' && n === '*') { inBC = true; i+=2; continue; }
  if (c === '"' || c === "'") { inS = c; i++; continue; }
  if (c === '`') { btOutside++; lastBtLine = line; inT = true; i++; continue; }
  i++;
}
console.log('backticks that OPEN a template literal:', btOutside);
console.log('still inside template at EOF?', inT);
console.log('last opening backtick at line:', lastBtLine);

