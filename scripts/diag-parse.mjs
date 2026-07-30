/* Documentado por: Miguel Flores */
import { parse } from 'acorn';
import fs from 'fs';
const src = fs.readFileSync('client/components/topbar.js', 'utf8');
try {
  parse(src, { ecmaVersion: 2022, sourceType: 'module', allowImportExportEverywhere: true, allowAwaitOutsideFunction: true });
  console.log('OK: topbar.js parses cleanly');
} catch (e) {
  console.log('PARSE ERROR:', e.message);
  console.log('loc:', JSON.stringify(e.loc));
  console.log('pos:', e.pos);
  const lines = src.split('\n');
  const ln = e.loc?.line || 0;
  for (let i = Math.max(0, ln-3); i < Math.min(lines.length, ln+2); i++) {
    const marker = i === ln-1 ? '>>' : '  ';
    console.log(`${marker} ${i+1}: ${lines[i]}`);
  }
}

