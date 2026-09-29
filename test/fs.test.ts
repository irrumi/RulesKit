import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  atomicWrite,
  readOptional,
  safePath,
  withLock,
} from '../src/core/fs.js';
import { init, sync } from '../src/core/sync.js';
import { repository, put, get } from './helpers.js';

test('reject traversal, absolute paths, alternate streams and Windows separators', async (t) => {
  const root = await repository(t);
  for (const bad of [
    '../bad',
    '/bad',
    'C:/bad',
    'file:stream',
    'a\\..\\bad',
    'a//b',
  ])
    await assert.rejects(safePath(root, bad));
});
test('atomic write preserves content on optimistic concurrency conflict', async (t) => {
  const root = await repository(t);
  await put(root, 'notes.md', 'human');
  await assert.rejects(
    atomicWrite(root, { path: 'notes.md', before: 'stale', after: 'new' }),
    /changed during/,
  );
  assert.equal(await get(root, 'notes.md'), 'human');
  await atomicWrite(root, { path: 'notes.md', before: 'human', after: 'new' });
  assert.equal(await get(root, 'notes.md'), 'new');
  assert(!(await fs.readdir(root)).some((f) => f.endsWith('.tmp')));
});
test('no writes through junctions even when earlier outputs are valid', async (t) => {
  const root = await repository(t),
    outside = await repository(t);
  await init(root);
  await fs.symlink(outside, path.join(root, '.cursor'), 'junction');
  await assert.rejects(sync(root), /symbolic link\/junction/);
  await assert.rejects(fs.stat(path.join(root, 'CLAUDE.md')));
  await assert.rejects(fs.stat(path.join(outside, 'rules')));
});
test('no writes through a linked canonical configuration directory', async (t) => {
  const root = await repository(t),
    outside = await repository(t);
  await fs.symlink(outside, path.join(root, '.ruleskit'), 'junction');
  await assert.rejects(init(root), /symbolic link\/junction/);
  await assert.rejects(fs.stat(path.join(outside, 'write.lock')));
});
test('reject non-regular and oversized files', async (t) => {
  const root = await repository(t);
  await fs.mkdir(path.join(root, 'directory'));
  await assert.rejects(readOptional(root, 'directory'), /regular file/);
  await put(root, 'large', '12345');
  await assert.rejects(readOptional(root, 'large', 4), /limit/);
});
test('exclusive lock refuses overlapping writers and is released after failure', async (t) => {
  const root = await repository(t);
  await assert.rejects(
    withLock(root, async () => {
      await assert.rejects(
        withLock(root, async () => 0),
        /locked/,
      );
      throw new Error('intentional');
    }),
    /intentional/,
  );
  assert.equal(await withLock(root, async () => 42), 42);
});

test('invalid text encoding is refused rather than corrupting human bytes', async (t) => {
  const root = await repository(t);
  await init(root);
  const original = Buffer.from([255, 254, 65, 0]);
  await fs.writeFile(path.join(root, 'AGENTS.md'), original);
  await assert.rejects(sync(root, { merge: true }), /Invalid UTF-8/);
  assert.deepEqual(await fs.readFile(path.join(root, 'AGENTS.md')), original);
  await assert.rejects(fs.stat(path.join(root, 'CLAUDE.md')));
});
