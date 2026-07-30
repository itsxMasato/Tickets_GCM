/* Documentado por: Miguel Flores */
import { readFileSync } from 'fs';
import { transformSync } from 'esbuild';
const src = readFileSync('client/components/topbar.js', 'utf8');
try {
  transformSync(src, { loader: 'js', sourcefile: 'topbar.js' });
  console.log('OK: parses as JS module');
} catch (e) {
  console.log('ERROR:', e.message);
  if (e.errors) for (const err of e.errors) {
    console.log('  loc:', err.location);
  }
}

