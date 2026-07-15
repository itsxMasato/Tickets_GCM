// Test 1: backticks in // comment - is it valid JS?
import { transformSync } from 'esbuild';
const tests = [
  { name: 'backticks in // comment', code: '// `foo` bar\nconst x = 1;' },
  { name: 'backtick in // comment, then template', code: '// `x`\nconst a = `b ${1} c`;' },
  { name: 'normal file with comment-backticks', code: '// `x`\nfunction f() { return `tpl`; }' },
];
for (const t of tests) {
  try {
    transformSync(t.code, { loader: 'js' });
    console.log(t.name, 'OK');
  } catch (e) {
    console.log(t.name, 'ERR:', e.errors?.[0]?.text, e.errors?.[0]?.location);
  }
}
