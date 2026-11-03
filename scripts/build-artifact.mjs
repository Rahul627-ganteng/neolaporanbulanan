// =====================================================================
//  Membangun prototipe single-file (artefak claude.ai / HTML mandiri)
//  dari kode sumber yang SAMA dengan aplikasi produksi.
//   - React, Recharts, Lucide, docx, JSZip, pdf-lib, html-to-image dimuat
//     dari CDN (UMD) dan dipetakan ke variabel global.
//   - CSS Tailwind v4 dikompilasi lalu disisipkan inline.
//   - Adapter Supabase diganti stub → aplikasi otomatis Mode Demo.
//   - Seluruh berkas repositori disisipkan untuk tab "Blueprint Produksi".
//  Pakai:  npm run build:artifact   → artifact/portal-laporan-kmi.html
// =====================================================================
import { build } from 'esbuild';
import { compile } from 'tailwindcss';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifact');
fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- CDN (versi dipin)
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
  'INLINE:window.react = window.React;', // UMD lucide-react membaca global "react"
  'https://cdnjs.cloudflare.com/ajax/libs/prop-types/15.8.1/prop-types.min.js',
  'https://cdn.jsdelivr.net/npm/recharts@2.12.7/umd/Recharts.js',
  'https://cdn.jsdelivr.net/npm/lucide-react@0.263.1/dist/umd/lucide-react.min.js',
  'https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js',
];
const GLOBALS = {
  react: 'React',
  'react-dom/client': 'ReactDOM',
  recharts: 'Recharts',
  'lucide-react': 'LucideReact',
  docx: 'docx',
  jszip: 'JSZip',
  'pdf-lib': 'PDFLib',
  'html-to-image': 'htmlToImage',
};
const COMPONENT_LIBS = new Set(['recharts', 'lucide-react']);
const FONTS =
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap';

// ---------------------------------------------------------------- berkas sumber
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'artifact', '.git', '.temp'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
const allFiles = walk(root).map((p) => path.relative(root, p).split(path.sep).join('/'));
const sourceFiles = allFiles.filter((f) => /\.(jsx?|mjs)$/.test(f) && (f.startsWith('src/') || f.startsWith('supabase/functions/_shared')));
const sourceText = sourceFiles.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');

// ---------------------------------------------------------------- Tailwind v4
async function buildCss() {
  const twDir = path.dirname(require.resolve('tailwindcss/package.json'));
  const input = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
  const compiler = await compile(input, {
    base: path.join(root, 'src'),
    async loadStylesheet(id, base) {
      const file = id === 'tailwindcss' ? path.join(twDir, 'index.css') : path.resolve(base, id.startsWith('tailwindcss/') ? path.join(twDir, id.slice(12)) : id);
      return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
    },
  });
  // Dua cara pemisahan: utuh (nilai arbitrer seperti grid-cols-[minmax(0,1fr)_300px])
  // dan terpecah (kelas di dalam ekspresi JSX).
  const tokens = [...sourceText.split(/[\s"'`]+/), ...sourceText.split(/[\s"'`{}()<>;,]+/)];
  const candidates = new Set(tokens.filter((t) => t && t.length < 90));
  return compiler.build([...candidates]);
}

// ---------------------------------------------------------------- shim global
function importedNames(mod) {
  const names = new Set();
  const re = new RegExp(`import\\s+([^;]*?)\\s+from\\s+['"]${mod.replace(/[/\\-]/g, (m) => `\\${m}`)}['"]`, 'g');
  for (const m of sourceText.matchAll(re)) {
    const named = m[1].match(/\{([^}]*)\}/);
    if (named) named[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach((n) => names.add(n));
  }
  return [...names];
}

const globalsPlugin = {
  name: 'cdn-globals',
  setup(b) {
    const filter = new RegExp(`^(${Object.keys(GLOBALS).map((k) => k.replace(/[/\\-]/g, (m) => `\\${m}`)).join('|')})$`);
    b.onResolve({ filter }, (a) => ({ path: a.path, namespace: 'cdn-global' }));
    b.onLoad({ filter: /.*/, namespace: 'cdn-global' }, (a) => {
      const g = GLOBALS[a.path];
      const fallback = COMPONENT_LIBS.has(a.path) ? '(function(){return null;})' : 'undefined';
      const names = importedNames(a.path);
      const body = [
        `const G = (typeof window !== 'undefined' && window[${JSON.stringify(g)}]) || {};`,
        `if (!window[${JSON.stringify(g)}]) console.warn('[KMI] Pustaka ${a.path} gagal dimuat dari CDN');`,
        'export default (G && G.default) || G;',
        ...names.map((n) => `export const ${n} = G[${JSON.stringify(n)}] || ${fallback};`),
      ];
      return { contents: body.join('\n'), loader: 'js' };
    });
    b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'supabase-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: "export function createClient(){ throw new Error('Supabase tidak tersedia di prototipe'); }",
      loader: 'js',
    }));
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
  },
};

// ---------------------------------------------------------------- blueprint
const NOTES = {
  'supabase/migrations/20261103000001_schema.sql': 'Skema relasional, RLS, RPC',
  'supabase/migrations/20261103000002_seed_departments.sql': 'Seed 48 bagian & tahun ajaran awal',
  'supabase/migrations/20261103000003_cron_reminders.sql': 'pg_cron + pg_net harian',
  'supabase/functions/weekly-reminder/index.ts': 'Edge Function antrean pengingat',
  'supabase/functions/_shared/rundown.js': 'Aturan rundown & template WA (bersama)',
  '.github/workflows/deploy.yml': 'CI/CD: build → migrasi → deploy',
  'netlify.toml': 'Build, SPA redirect, header, env',
  'README.md': 'Panduan deploy langkah demi langkah',
};
const ORDER = ['README.md', 'supabase/migrations', 'supabase/functions', 'supabase/config.toml', 'supabase/scripts', '.github', 'netlify.toml', '.env.example', 'package.json', 'vite.config.js', 'index.html', 'src/', 'scripts/', 'public/', '.gitignore'];
const rank = (f) => {
  const i = ORDER.findIndex((o) => f === o || f.startsWith(o));
  return i < 0 ? 99 : i;
};
const blueprint = allFiles
  .filter((f) => !/\.(png|jpe?g|webp|zip|docx|pdf)$/.test(f))
  .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  .map((f) => ({ path: f, note: NOTES[f] || '', content: fs.readFileSync(path.join(root, f), 'utf8') }));

// ---------------------------------------------------------------- rakit
let css = await buildCss();
// Foto latar (public/img) disisipkan sebagai data URI karena artefak tidak bisa memuat berkas lokal.
for (const img of ['masjid-gontor3.webp', 'masjid-gontor3-sm.webp']) {
  const file = path.join(root, 'public/img', img);
  if (fs.existsSync(file)) {
    const uri = `data:image/webp;base64,${fs.readFileSync(file).toString('base64')}`;
    css = css.split(`/img/${img}`).join(uri);
  }
}
const js = await build({
  entryPoints: [path.join(root, 'src/main.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  target: 'es2020',
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  define: { 'import.meta.env': '{}' },
  legalComments: 'none',
  plugins: [globalsPlugin],
  logLevel: 'warning',
});
const appJs = js.outputFiles[0].text;
const safeJson = JSON.stringify(blueprint).replace(/</g, '\\u003c');
const scripts = CDN.map((s) => (s.startsWith('INLINE:') ? `<script>${s.slice(7)}</script>` : `<script src="${s}" crossorigin="anonymous"></script>`)).join('\n');

const html = `<title>Portal Laporan Bulanan KMI</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
</style>
<div id="root"></div>
<script>window.__KMI_ARTIFACT__ = true;</script>
<script type="application/json" id="kmi-blueprint">${safeJson}</script>
<script>try { window.__KMI_BLUEPRINT__ = JSON.parse(document.getElementById('kmi-blueprint').textContent); } catch (e) { window.__KMI_BLUEPRINT__ = []; }</script>
${scripts}
<script>
${appJs.replace(/<\/script/gi, '<\\/script')}
</script>
`;
const out = path.join(outDir, 'portal-laporan-kmi.html');
fs.writeFileSync(out, html);
console.log(`Artefak: ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB; CSS ${(css.length / 1024).toFixed(0)} KB, JS ${(appJs.length / 1024).toFixed(0)} KB, ${blueprint.length} berkas blueprint)`);
