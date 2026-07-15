// Use V8 to parse the file as a module and report the actual error.
import { readFileSync } from 'fs';
import { transformSync } from 'esbuild';
const src = readFileSync('client/components/topbar.js', 'utf8');
try {
  // We just want syntax check; transform with no minify, write to /dev/null
  transformSync(src, { loader: 'js', sourcefile: 'topbar.js' });
  console.log('OK: parses as JS module');
} catch (e) {
  console.log('ERROR:', e.message);
  if (e.errors) for (const err of e.errors) {
    console.log('  loc:', err.location);
  }
}
