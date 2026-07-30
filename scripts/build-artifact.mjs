/**
 * Builds a single self-contained HTML *fragment* for publishing as a Claude
 * Artifact. It inlines the production Vite build (exact same compiled app as
 * localhost) and embeds the Poppins webfont as @font-face data URIs so the
 * shared version keeps the real typeface (Artifacts block external font CDNs).
 *
 * Output: dist-artifact/leave-date-selector.html — NO <!doctype>/<html>/<head>/
 * <body> (the Artifact host wraps the fragment in that skeleton).
 *
 * Prereq: `npm run build` first (reads dist/assets/*.{css,js}).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const distAssets = join(root, 'dist', 'assets');
const outDir = join(root, 'dist-artifact');

const files = readdirSync(distAssets);
const cssFile = files.find((f) => f.endsWith('.css'));
const jsFile = files.find((f) => f.endsWith('.js'));
if (!cssFile || !jsFile) {
  throw new Error('Build assets not found — run `npm run build` first.');
}
const css = readFileSync(join(distAssets, cssFile), 'utf8');
let js = readFileSync(join(distAssets, jsFile), 'utf8');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function buildFontFaces() {
  const weights = [400, 500, 600, 700];
  const url = `https://fonts.googleapis.com/css2?family=Poppins:wght@${weights.join(';')}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`font css HTTP ${res.status}`);
  const fontCss = await res.text();

  // Each weight has @font-face blocks per unicode-range; keep only `/* latin */`.
  const blockRe = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g;
  const faces = [];
  let m;
  while ((m = blockRe.exec(fontCss))) {
    if (m[1] !== 'latin') continue;
    const body = m[2];
    const weight = (body.match(/font-weight:\s*(\d+)/) || [])[1];
    const woff2Url = (body.match(/url\(([^)]+)\)\s*format\('woff2'\)/) || [])[1];
    if (!weight || !woff2Url) continue;
    const fr = await fetch(woff2Url, { headers: { 'User-Agent': UA } });
    if (!fr.ok) throw new Error(`woff2 HTTP ${fr.status}`);
    const b64 = Buffer.from(await fr.arrayBuffer()).toString('base64');
    faces.push(
      `@font-face{font-family:'Poppins';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}`,
    );
  }
  if (!faces.length) throw new Error('no latin @font-face blocks parsed');
  return faces.join('\n');
}

let fontFaces = '';
try {
  fontFaces = await buildFontFaces();
  console.log('Embedded Poppins (latin, weights 400/500/600/700).');
} catch (e) {
  console.warn(`Font embed skipped, using system fallback: ${e.message}`);
}

// Prevent the inline module script from being terminated early by a literal
// "</script>" inside the bundled JS (equivalent inside JS strings).
js = js.replace(/<\/script>/gi, '<\\/script>');

const fragment = `<style>
${fontFaces}
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'leave-date-selector.html');
writeFileSync(out, fragment, 'utf8');
console.log(`Wrote ${out} (${(fragment.length / 1024).toFixed(1)} KB).`);
