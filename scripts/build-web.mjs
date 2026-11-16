import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const outDir = path.join(root, 'www');
const entries = ['index.html', 'manifest.webmanifest', 'sw.js', 'privacy.html', 'css', 'js', 'vendor', 'icons', 'assets'];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(outDir, entry), { recursive: true });
}

let buildId = 'local';
try {
  buildId = execSync('git rev-parse --short=8 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'local';
} catch { /* non-git fallback */ }

const swPath = path.join(outDir, 'sw.js');
if (fs.existsSync(swPath)) {
  const sw = fs.readFileSync(swPath, 'utf8').replaceAll('__BUILD__', buildId);
  fs.writeFileSync(swPath, sw, 'utf8');
}

console.log(`Built web bundle in www/ (build ${buildId})`);
