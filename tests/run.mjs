// Runs every *.test.ts file in this folder, each in its own process (the game modules keep state). Usage: npm test
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith('.test.ts')).sort();
let failed = 0;
for (const f of files) {
  try {
    execSync(`npx -y tsx "${join(here, f)}"`, { stdio: 'pipe' });
    console.log(`pass  ${f}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${f}\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  }
}
console.log(failed ? `${failed} of ${files.length} test files failed` : `all ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
