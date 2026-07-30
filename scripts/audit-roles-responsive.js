/* Documentado por: Miguel Flores */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'client', 'views', 'roles.js');
const src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');

const bp = [];
const bpRe = /(sm|md|lg|xl|2xl):[a-zA-Z0-9_-]+/g;
for (let i = 0; i < lines.length; i++) {
  const cleaned = lines[i].replace(/\\:/g, ':');
  const matches = cleaned.match(bpRe);
  if (matches) {
    for (const m of matches) bp.push({ line: i + 1, snippet: m });
  }
}
console.log('=== Clases responsive (limpio de \\:) ===');
console.log('Total:', bp.length);
const counts = {};
for (const x of bp) {
  const k = x.snippet.match(/(sm|md|lg|xl|2xl):/)[1];
  counts[k] = (counts[k] || 0) + 1;
}
console.log('Por breakpoint:', counts);
console.log('Ejemplos (linea, snippet):');
for (const x of bp.slice(0, 12)) console.log(' ', x.line, x.snippet);
console.log('');

console.log('=== Líneas con sticky ===');
for (let i = 0; i < lines.length; i++) {
  if (/sticky/.test(lines[i]) && !lines[i].trim().startsWith('//')) {
    console.log(' ', i + 1, lines[i].trim());
  }
}
console.log('');

console.log('=== overflow-x-auto ===');
for (let i = 0; i < lines.length; i++) {
  if (/overflow-x-auto/.test(lines[i])) console.log(' ', i+1, lines[i].trim());
}
console.log('');

console.log('=== grid-cols ===');
for (let i = 0; i < lines.length; i++) {
  if (/grid-cols/.test(lines[i])) console.log(' ', i+1, lines[i].trim());
}
console.log('');

console.log('=== inline styles ===');
for (let i = 0; i < lines.length; i++) {
  if (/style:\s*\{/.test(lines[i])) {
    const start = i+1;
    console.log(' ', start, lines.slice(i, i+3).join(' | ').trim());
  }
}
console.log('');

console.log('=== Botones sin min-h de 44px (tamaño táctil) ===');
for (let i = 0; i < lines.length; i++) {
  if (/h-\d/.test(lines[i]) && !/min-h/.test(lines[i])) {
    const m = lines[i].match(/h-(\d+)/);
    if (m) {
      const px = parseInt(m[1], 10) * 4;
      if (px < 32)
        console.log(' ', i+1, 'h=' + px + 'px', lines[i].trim());
    }
  }
}

