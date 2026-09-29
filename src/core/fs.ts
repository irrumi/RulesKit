import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { relativePathSchema } from '../model.js';

export const hash = (text: string | Buffer): string =>
  createHash('sha256').update(text).digest('hex');
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}
export async function rootPath(root: string): Promise<string> {
  const resolved = await fs.realpath(root);
  if (!(await fs.stat(resolved)).isDirectory())
    throw new Error(`Not a directory: ${root}`);
  return resolved;
}
/** Reject links at every component, including Windows junctions. Root must be canonical. */
export async function safePath(
  root: string,
  relative: string,
): Promise<string> {
  relativePathSchema.parse(relative);
  let current = root;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]!);
    try {
      const info = await fs.lstat(current);
      if (info.isSymbolicLink())
        throw new Error(`Refusing symbolic link/junction: ${relative}`);
      if (i < parts.length - 1 && !info.isDirectory())
        throw new Error(`Not a directory: ${relative}`);
      if (i === parts.length - 1 && !info.isFile() && !info.isDirectory())
        throw new Error(`Not a regular file: ${relative}`);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return current;
}
export async function readOptional(
  root: string,
  relative: string,
  maxBytes = 4 * 1024 * 1024,
): Promise<string | null> {
  const target = await safePath(root, relative);
  try {
    const info = await fs.stat(target);
    if (!info.isFile()) throw new Error(`Not a regular file: ${relative}`);
    if (info.size > maxBytes)
      throw new Error(`File exceeds ${maxBytes} byte limit: ${relative}`);
    return await fs.readFile(target, 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
export interface Change {
  path: string;
  before: string | null;
  after: string;
}
export async function atomicWrite(root: string, change: Change): Promise<void> {
  const target = await safePath(root, change.path);
  if ((await readOptional(root, change.path)) !== change.before)
    throw new Error(`File changed during operation: ${change.path}`);
  if (change.before === change.after) return;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await safePath(root, change.path);
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    const mode = change.before === null ? 0o644 : (await fs.stat(target)).mode;
    const handle = await fs.open(temp, 'wx', mode);
    try {
      await handle.writeFile(change.after, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await safePath(root, change.path);
    if ((await readOptional(root, change.path)) !== change.before)
      throw new Error(`File changed during operation: ${change.path}`);
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
export async function withLock<T>(
  root: string,
  action: () => Promise<T>,
): Promise<T> {
  const lock = await safePath(root, '.ruleskit/write.lock');
  await fs.mkdir(path.dirname(lock), { recursive: true });
  let handle;
  try {
    handle = await fs.open(lock, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error(
        'RulesKit is locked. If no RulesKit process is running, remove .ruleskit/write.lock and retry.',
        { cause: error },
      );
    throw error;
  }
  try {
    await handle.writeFile(String(process.pid));
    return await action();
  } finally {
    await handle.close();
    await fs.unlink(lock);
  }
}
