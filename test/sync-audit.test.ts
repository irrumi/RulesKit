import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { init, sync, preview } from '../src/core/sync.js';
import { audit } from '../src/audit.js';
import { loadConfig, CONFIG, STATE } from '../src/config.js';
import { adapters, extractBlock } from '../src/adapters.js';
import { repository, put, get, editConfig } from './helpers.js';

for (const fixture of ['react', 'django', 'rust', 'monorepo', 'empty'])
  test(`full lifecycle and idempotent sync: ${fixture}`, async (t) => {
    const root = await repository(t, fixture);
    await init(root);
    assert.equal((await audit(root)).status, 'stale');
    await sync(root);
    assert.equal((await audit(root)).status, 'synchronized');
    const first = await fs.stat(path.join(root, 'AGENTS.md'));
    const plan = await sync(root);
    assert(plan.changes.every((c) => c.before === c.after));
    assert.equal(
      (await fs.stat(path.join(root, 'AGENTS.md'))).mtimeMs,
      first.mtimeMs,
    );
  });
test('dry-run init and sync write nothing and expose a diff', async (t) => {
  const root = await repository(t);
  const initPlan = await init(root, { dryRun: true });
  assert(preview(initPlan).includes('config.yaml'));
  await assert.rejects(fs.stat(path.join(root, '.ruleskit')));
  await init(root);
  const before = await get(root, CONFIG);
  assert(
    preview(await sync(root, { dryRun: true, refresh: true })).includes(
      'AGENTS.md',
    ),
  );
  assert.equal(await get(root, CONFIG), before);
  await assert.rejects(fs.stat(path.join(root, 'AGENTS.md')));
  await assert.rejects(fs.stat(path.join(root, STATE)));
});
test('existing user content requires explicit merge and survives subsequent updates byte-for-byte', async (t) => {
  const root = await repository(t, 'existing'),
    manual = await get(root, 'AGENTS.md');
  await init(root);
  assert.equal(await get(root, 'AGENTS.md'), manual);
  await assert.rejects(sync(root), /existing instructions/);
  await assert.rejects(
    fs.stat(path.join(root, '.github/copilot-instructions.md')),
  );
  await sync(root, { merge: true });
  await editConfig(root, (c) =>
    c.userRules.push({ id: 'x', text: 'Use the stable API.', scope: '.' }),
  );
  await sync(root);
  assert((await get(root, 'AGENTS.md')).startsWith(manual));
  assert.equal(
    await get(root, '.cursor/rules/manual.mdc'),
    '---\nalwaysApply: true\n---\nHuman rule\n',
  );
  assert.equal((await audit(root)).status, 'synchronized');
});
test('manual edits inside generated blocks refuse writes until explicitly accepted', async (t) => {
  const root = await repository(t);
  await init(root);
  await sync(root);
  await put(
    root,
    'AGENTS.md',
    (await get(root, 'AGENTS.md')).replace(
      'Project instructions',
      'Manual edit',
    ),
  );
  const before = await get(root, STATE);
  assert((await audit(root)).issues.some((i) => i.code === 'output-edited'));
  await assert.rejects(sync(root), /generated block was edited/);
  assert.equal(await get(root, STATE), before);
  await sync(root, { overwriteGenerated: true });
  assert.equal((await audit(root)).status, 'synchronized');
});
test('manual suffixes remain editable and do not cause drift', async (t) => {
  const root = await repository(t);
  await init(root);
  await sync(root);
  await put(
    root,
    'AGENTS.md',
    (await get(root, 'AGENTS.md')) + '\nHuman appendix\n',
  );
  assert.equal((await audit(root)).status, 'synchronized');
  await sync(root);
  assert((await get(root, 'AGENTS.md')).endsWith('Human appendix\n'));
});
test('manifest, lockfile and layout drift are detected; refresh preserves user rules', async (t) => {
  const root = await repository(t, 'react');
  await put(root, 'package-lock.json', '{"lockfileVersion":3}');
  await init(root);
  await sync(root);
  await editConfig(root, (c) =>
    c.userRules.push({
      id: 'keep',
      text: 'Preserve protocol compatibility.',
      scope: '.',
    }),
  );
  assert((await audit(root)).issues.some((i) => i.code === 'config-changed'));
  await put(root, 'package-lock.json', '{"lockfileVersion":3,"packages":{}}');
  await put(root, 'src/new.ts', '');
  const issues = (await audit(root)).issues;
  assert(
    issues.some(
      (i) => i.code === 'input-changed' && i.path === 'package-lock.json',
    ),
  );
  assert(issues.some((i) => i.code === 'structure-changed'));
  await sync(root);
  assert.equal((await audit(root)).status, 'stale');
  await sync(root, { refresh: true });
  assert.equal((await loadConfig(root)).userRules[0]?.id, 'keep');
  assert.equal((await audit(root)).status, 'synchronized');
});
test('stack changes and deleted evidence are detected', async (t) => {
  const root = await repository(t, 'react');
  await init(root);
  await sync(root);
  await put(root, 'package.json', '{"dependencies":{"vue":"3"}}');
  await fs.unlink(path.join(root, 'tsconfig.json'));
  const issues = (await audit(root)).issues;
  assert(issues.some((i) => i.code === 'facts-changed'));
  assert(issues.some((i) => i.path === 'tsconfig.json'));
});
test('missing output is audited and safely recreated', async (t) => {
  const root = await repository(t);
  await init(root);
  await sync(root);
  await fs.unlink(path.join(root, 'AGENTS.md'));
  assert((await audit(root)).issues.some((i) => i.code === 'missing-output'));
  await sync(root);
  assert.equal((await audit(root)).status, 'synchronized');
});
test('untrusted markers and corrupted state cannot authorize overwrites', async (t) => {
  const root = await repository(t);
  await init(root);
  await sync(root);
  await fs.unlink(path.join(root, STATE));
  await assert.rejects(
    sync(root, { overwriteGenerated: true }),
    /without trusted state/,
  );
  await put(root, STATE, '{broken');
  await assert.rejects(sync(root), /Invalid.*state/);
});
test('frontmatter is checked and unrelated rule files remain unmanaged', async (t) => {
  const root = await repository(t);
  await init(root);
  await sync(root);
  await put(
    root,
    '.cursor/rules/ruleskit.mdc',
    (await get(root, '.cursor/rules/ruleskit.mdc')).replace(
      'alwaysApply: true',
      'alwaysApply: false',
    ),
  );
  assert((await audit(root)).issues.some((i) => i.code === 'invalid-output'));
  await assert.rejects(sync(root), /frontmatter/);
});
test('deselected outputs are reported and never silently deleted', async (t) => {
  const root = await repository(t);
  await init(root);
  await sync(root);
  await editConfig(root, (c) => {
    c.agents = ['codex'];
  });
  assert((await audit(root)).issues.some((i) => i.code === 'orphan-output'));
  await assert.rejects(sync(root), /Deselected output/);
  assert((await get(root, 'CLAUDE.md')).includes('ruleskit:begin'));
});
test('malformed source and shadowed agent rules cannot produce a clean audit', async (t) => {
  const root = await repository(t);
  await put(root, 'package.json', '{oops');
  await init(root);
  await sync(root);
  await put(root, 'AGENTS.override.md', 'override');
  await put(root, '.devin/rules/manual.md', 'preferred');
  const issues = (await audit(root)).issues;
  assert(issues.some((i) => i.code === 'incomplete-scan'));
  assert.equal(issues.filter((i) => i.code === 'shadowed-output').length, 2);
});

test('removing a deselected managed block preserves its human appendix', async (t) => {
  const root = await repository(t);
  await init(root);
  await sync(root);
  await editConfig(root, (c) => {
    c.agents = c.agents.filter((a) => a !== 'claude');
  });
  const text = await get(root, 'CLAUDE.md');
  const block = extractBlock(text)!;
  await put(
    root,
    'CLAUDE.md',
    text.slice(0, block.start) + text.slice(block.end) + 'Human appendix',
  );
  await sync(root);
  assert.equal((await audit(root)).status, 'synchronized');
  assert((await get(root, 'CLAUDE.md')).endsWith('Human appendix'));
});

test('a state missing one output ownership entry never audits clean', async (t) => {
  const root = await repository(t);
  await init(root);
  await sync(root);
  const state = JSON.parse(await get(root, STATE));
  delete state.outputs['AGENTS.md'];
  await put(root, STATE, JSON.stringify(state));
  assert((await audit(root)).issues.some((i) => i.code === 'untracked-output'));
  await assert.rejects(sync(root), /without trusted state/);
});

test('CRLF checkout conversion does not create false repository or output drift', async (t) => {
  const root = await repository(t, 'react');
  await init(root);
  await sync(root);
  for (const file of [
    'package.json',
    'tsconfig.json',
    ...Object.values(adapters).map((a) => a.path),
  ])
    await put(root, file, (await get(root, file)).replaceAll('\n', '\r\n'));
  assert.equal((await audit(root)).status, 'synchronized');
  assert((await sync(root)).changes.every((c) => c.before === c.after));
});
