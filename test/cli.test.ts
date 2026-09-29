import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repository, put } from './helpers.js';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
function run(root: string, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', cli, ...args, '--root', root],
    { encoding: 'utf8' },
  );
  assert.equal(result.error, undefined);
  return result;
}
test('CLI help, version, strict option validation and JSON errors', async (t) => {
  const root = await repository(t);
  assert.match(run(root, '--help').stdout, /Usage: ruleskit/);
  assert.equal(run(root, '--version').stdout.trim(), '0.1.0');
  for (const args of [
    ['unknown'],
    ['scan', '--merge'],
    ['generate', '--refresh'],
    ['scan', '--typo'],
    ['scan', '--dry-run'],
    ['scan', 'extra'],
  ]) {
    const result = run(root, ...args, '--json');
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stderr).exitCode, 2);
  }
});
test('CLI lifecycle exit codes and machine-readable plans', async (t) => {
  const root = await repository(t, 'react');
  assert.equal(
    JSON.parse(run(root, 'scan', '--json').stdout).facts.some(
      (f: { value: string }) => f.value === 'React',
    ),
    true,
  );
  assert.equal(run(root, 'audit').status, 2);
  const dry = run(root, 'init', '--dry-run', '--json');
  assert.equal(dry.status, 0);
  assert.equal(JSON.parse(dry.stdout).dryRun, true);
  assert.equal(run(root, 'init', '--yes').status, 0);
  assert.equal(run(root, 'init').status, 2);
  assert.equal(run(root, 'audit').status, 1);
  assert.equal(run(root, 'generate').status, 0);
  assert.equal(run(root, 'audit', '--json').status, 0);
  assert.equal(
    JSON.parse(run(root, 'sync', '--json').stdout).changes.length,
    0,
  );
  await put(root, 'src/new.ts', '');
  assert.equal(run(root, 'audit').status, 1);
  assert.equal(run(root, 'sync', '--refresh', '--yes').status, 0);
  assert.equal(run(root, 'audit').status, 0);
});
test('--yes never grants permission to overwrite human instructions', async (t) => {
  const root = await repository(t, 'existing');
  assert.equal(run(root, 'init').status, 0);
  const result = run(root, 'generate', '--yes');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /protected/);
});
