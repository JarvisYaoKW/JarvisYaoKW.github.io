import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
let checked = 0;
for (const directory of ['', 'tools', 'tests']) {
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(mjs|js)$/.test(entry.name)) continue;
    const result = spawnSync(process.execPath, ['--check', join(root, directory, entry.name)], {
      stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
    checked++;
  }
}
console.log(`Syntax checked: ${checked} JavaScript files.`);
