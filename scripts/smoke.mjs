import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { URL } from 'node:url';

// Test the actual distributable, with only production dependencies in a fresh prefix.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script with npm run smoke.');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleskit-package-'));
try {
  const runNpm = (args, cwd = process.cwd()) =>
    execFileSync(process.execPath, [npmCli, ...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
  const pack = JSON.parse(
    runNpm([
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      temporary,
    ]),
  )[0];
  assert(pack.files.some((f) => f.path === 'dist/cli.js'));
  assert(
    pack.files.every(
      (f) =>
        !/(?:^|\/)(?:node_modules|test|\.env|\.git|\.ruleskit)\//.test(f.path),
    ),
  );
  const install = path.join(temporary, 'installed');
  await fs.mkdir(install);
  runNpm([
    'install',
    '--prefix',
    install,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    path.join(temporary, pack.filename),
  ]);
  const bin = path.join(install, 'node_modules/@irrumi/ruleskit/dist/cli.js');
  const run = (root, ...args) =>
    execFileSync(process.execPath, [bin, ...args, '--root', root], {
      encoding: 'utf8',
    });
  assert.match(run(install, '--help'), /Usage: ruleskit/);
  const shim = path.join(
    install,
    'node_modules/.bin',
    process.platform === 'win32' ? 'ruleskit.cmd' : 'ruleskit',
  );
  assert((await fs.stat(shim)).isFile());
  // npm exec exercises the platform-specific bin shim without shell interpolation.
  assert.match(
    runNpm(['exec', '--offline', '--', 'ruleskit', '--help'], install),
    /Usage: ruleskit/,
  );
  const fixtures = JSON.parse(
    await fs.readFile(
      new URL('../test/fixtures/repositories.json', import.meta.url),
      'utf8',
    ),
  );
  for (const [name, files] of Object.entries(fixtures)) {
    const root = path.join(temporary, 'fixtures', name);
    await fs.mkdir(root, { recursive: true });
    for (const [file, text] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), text);
    }
    assert(Array.isArray(JSON.parse(run(root, 'scan', '--json')).facts));
    run(root, 'init', '--yes');
    run(root, 'generate', ...(name === 'existing' ? ['--merge'] : []));
    assert.equal(
      JSON.parse(run(root, 'audit', '--json')).status,
      'synchronized',
    );
    assert.equal(JSON.parse(run(root, 'sync', '--json')).changes.length, 0);
    console.log(`Packaged CLI passed: ${name}`);
  }
  console.log(
    `Clean production installation passed (${pack.files.length} packaged files).`,
  );
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
