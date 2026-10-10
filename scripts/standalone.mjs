import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Script } from 'node:vm';

// Produce a portable, network-free copy from the same verified Vite output.
const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
let html = await readFile(join(dist, 'index.html'), 'utf8');
const script = html.match(/<script\s+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
const style = html.match(/<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!script || !style) throw new Error('Build output does not contain the expected single script and stylesheet.');
const js = await readFile(join(dist, script[1]), 'utf8');
const css = (await readFile(join(dist, style[1]), 'utf8')).replace(/@import\s*(?:"[^"]*"|'[^']*'|url\([^)]*\))\s*;/g, '');
if (/@import\b/.test(css)) throw new Error('Standalone stylesheet still has an external import.');
new Script(js); // Syntax validation only: do not execute the application in Node.
html = html.replace(script[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(style[0], () => `<style>${css}</style>`);
await mkdir(join(root, 'outputs'), { recursive: true });
await writeFile(join(root, 'outputs', 'stormwalker.html'), html);
console.log('Created outputs/stormwalker.html (standalone, no external assets).');
