// Builds two outputs:
//   dist/game.js          — bundled game (used by index.html for dev; fetches assets/mfer.glb)
//   dist/mfer-skate.html  — fully self-contained single file (GLB embedded as base64)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: 'dist/game.js',
  logLevel: 'info',
});

const js = readFileSync('dist/game.js', 'utf8');
const glb = readFileSync('assets/mfer.glb').toString('base64');

const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>mfSk8 — mfer skate prototype</title>
<body></body>
<script>window.MFER_GLB_B64=${JSON.stringify(glb)};<\/script>
<script>${js.replace(/<\/script>/g, '<\\/script>')}<\/script>
`;
writeFileSync('dist/mfer-skate.html', html);
console.log(`dist/mfer-skate.html: ${(html.length / 1024 / 1024).toFixed(2)} MB`);
