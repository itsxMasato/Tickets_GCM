/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
const code = require('fs').readFileSync('C:\\Users\\flore\\OneDrive\\Desktop\\Tickets_GCM\\client\\views\\roles.js', 'utf8');
try {
  // Convert ESM to CJS-ish by wrapping — but this is module syntax. Just check the raw parse.
  // Use the babel/esprima-like via acorn? Node's Function constructor won't parse import. Use a manual check.
  // Try to parse with VM and bypass the import via stripping.
  const stripped = code.replace(/^import .*$/gm, '');
  new Function(stripped);
  console.log('No syntax error');
} catch (e) {
  console.log('Error:', e.message);
  const m = e.message.match(/(\d+):(\d+)/);
  if (m) {
    const ln = parseInt(m[1], 10);
    const lines = code.split('\n');
    console.log('--- context around line', ln, '---');
    for (let i = Math.max(0, ln - 3); i < Math.min(lines.length, ln + 3); i++) {
      console.log((i+1) + ': ' + lines[i]);
    }
  }
}
