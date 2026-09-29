import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { scan } from '../src/scanner.js';
import { repository, put } from './helpers.js';

for (const [fixture, values] of Object.entries({
  react: ['React', 'TypeScript', 'TypeScript strict mode', 'Vitest', 'Vite'],
  django: ['Django', 'Django REST Framework', 'pytest', 'Ruff', 'uv'],
  rust: ['Rust', 'Cargo', 'axum', 'sqlx', 'rustfmt'],
  monorepo: ['React', 'Django', 'pnpm workspaces', 'Docker', 'GitHub Actions'],
  empty: [],
})) {
  test(`detect ${fixture} evidence deterministically`, async (t) => {
    const root = await repository(t, fixture),
      first = await scan(root);
    for (const value of values)
      assert(
        first.facts.some((f) => f.value === value),
        value,
      );
    assert.deepEqual(await scan(root), first);
    assert(first.facts.every((f) => f.evidence.length > 0));
    if (fixture === 'empty') assert.equal(first.facts.length, 0);
  });
}
test('inferences are labeled and monorepo scopes preserved', async (t) => {
  const react = await scan(await repository(t, 'react'));
  assert.equal(
    react.facts.find((f) => f.category === 'api')?.confidence,
    'inference',
  );
  const mono = await scan(await repository(t, 'monorepo'));
  assert(mono.facts.some((f) => f.value === 'React' && f.scope === 'apps/web'));
  assert(
    mono.facts.some((f) => f.value === 'Django' && f.scope === 'apps/api'),
  );
});
test('malformed manifests produce warnings without fabricated facts', async (t) => {
  const root = await repository(t);
  for (const file of [
    'package.json',
    'Cargo.toml',
    'pyproject.toml',
    'tsconfig.json',
  ])
    await put(root, file, '{!bad');
  const result = await scan(root);
  assert.equal(
    result.warnings.filter((w) => w.startsWith('Cannot parse')).length,
    4,
  );
  assert.equal(result.facts.length, 0);
});
test('unknown dependencies do not invent frameworks or execute scripts', async (t) => {
  const root = await repository(t);
  await put(
    root,
    'package.json',
    JSON.stringify({
      dependencies: { 'made-up-framework': '1' },
      scripts: { test: 'echo TOP_SECRET && touch DO_NOT_CREATE' },
    }),
  );
  const result = await scan(root);
  assert(!JSON.stringify(result).includes('TOP_SECRET'));
  assert(!result.facts.some((f) => f.category === 'framework'));
  await assert.rejects(fs.stat(path.join(root, 'DO_NOT_CREATE')));
});
test('conflicting package managers are explicit', async (t) => {
  const root = await repository(t, 'react');
  await put(root, 'yarn.lock', '# lock');
  assert(
    (await scan(root)).warnings.some((w) =>
      w.startsWith('Conflicting package managers'),
    ),
  );
});
test('nested ignore rules, dependencies, secrets and custom ignores are respected', async (t) => {
  const root = await repository(t);
  await put(root, '.gitignore', 'ignored/\n*.py\n');
  await put(root, '.ruleskitignore', 'sample/\n');
  await put(root, 'sub/.gitignore', '!keep.py\n');
  for (const file of [
    'ignored/package.json',
    'sample/package.json',
    'node_modules/x/package.json',
    '.venv/package.json',
  ])
    await put(root, file, '{"dependencies":{"react":"1"}}');
  await put(root, '.env', 'SECRET=hidden');
  await put(root, 'skip.py', '');
  await put(root, 'sub/keep.py', '');
  const result = await scan(root);
  assert(!result.facts.some((f) => f.value === 'React'));
  assert(result.facts.some((f) => f.evidence.includes('sub/keep.py')));
  assert(!JSON.stringify(result).includes('hidden'));
});
test('existing and legacy instructions are inventoried but not hashed as code', async (t) => {
  const root = await repository(t, 'existing');
  await put(root, '.windsurfrules', 'legacy');
  await put(root, '.github/instructions/python.instructions.md', 'manual');
  const result = await scan(root);
  assert.equal(result.existingInstructions.length, 5);
  assert.equal(Object.keys(result.inputs).length, 0);
});
test('symlink directories are not followed', async (t) => {
  const root = await repository(t),
    outside = await repository(t, 'react');
  await fs.symlink(outside, path.join(root, 'linked'), 'junction');
  const result = await scan(root);
  assert.equal(result.facts.length, 0);
  assert(result.warnings.some((w) => w.includes('linked')));
});

test('source language is not invented from package.json alone', async (t) => {
  const root = await repository(t);
  await put(
    root,
    'package.json',
    '{"name":"assets-only","scripts":{"test":"tsx --test test/*.ts"}}',
  );
  const result = await scan(root);
  assert(!result.facts.some((f) => f.category === 'language'));
  assert(result.facts.some((f) => f.value === 'node:test'));
});

test('configuration filename detection is exact', async (t) => {
  const root = await repository(t);
  for (const file of [
    'pytestXini',
    'rustfmtXtoml',
    'goXmod',
    'pomXxml',
    'buildXgradle',
    'platformioXini',
    'CMakeListsXtxt',
  ])
    await put(root, file, '');
  assert.equal((await scan(root)).facts.length, 0);
});

test('binary Bun lock fingerprints preserve distinct invalid UTF-8 bytes', async (t) => {
  const root = await repository(t);
  await fs.writeFile(path.join(root, 'bun.lockb'), Buffer.from([255]));
  const first = await scan(root);
  await fs.writeFile(path.join(root, 'bun.lockb'), Buffer.from([254]));
  assert.notEqual(
    (await scan(root)).inputs['bun.lockb'],
    first.inputs['bun.lockb'],
  );
});

test('evidence read failures abort instead of masquerading as malformed syntax', async (t) => {
  const root = await repository(t);
  await fs.writeFile(path.join(root, 'package.json'), Buffer.from([255]));
  await assert.rejects(scan(root), /Invalid UTF-8/);
  await fs.unlink(path.join(root, 'package.json'));
  await fs.writeFile(path.join(root, 'Cargo.toml'), Buffer.from([255]));
  await assert.rejects(scan(root), /Invalid UTF-8/);
});
