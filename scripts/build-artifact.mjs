// Turns the Vite build in dist/ into one self-contained page for publishing
// as a claude.ai Artifact: JS and CSS inlined, no <html>/<head>/<body>
// (the Artifact skeleton wraps the page at publish time).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const asset = (re) => {
  const m = html.match(re);
  if (!m) throw new Error('asset not found: ' + re);
  return readFileSync(join(dist, m[1].replace(/^\//, '')), 'utf8');
};
const js = asset(/<script[^>]*src="([^"]+\.js)"/);
const cssText = asset(/<link[^>]*href="([^"]+\.css)"/);
const title = (html.match(/<title>(.*?)<\/title>/) || [, 'Team Planner'])[1];

const page =
  `<title>${title}</title>\n` +
  `<style>\n${cssText}\n</style>\n` +
  `<div id="root"></div>\n` +
  `<script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n`;

writeFileSync(join(dist, 'artifact.html'), page);
console.log(`dist/artifact.html  ${(page.length / 1024).toFixed(1)} kB`);
