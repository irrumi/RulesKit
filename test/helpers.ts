import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { loadConfig, CONFIG, serializeConfig } from '../src/config.js';
import type { Config } from '../src/model.js';

export async function repository(
  t: TestContext,
  fixture = 'empty',
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ruleskit-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const fixtures = JSON.parse(
    await fs.readFile(
      new URL('./fixtures/repositories.json', import.meta.url),
      'utf8',
    ),
  ) as Record<string, Record<string, string>>;
  for (const [file, text] of Object.entries(fixtures[fixture]!))
    await put(root, file, text);
  return root;
}
export async function put(
  root: string,
  file: string,
  text: string,
): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), text);
}
export const get = (root: string, file: string): Promise<string> =>
  fs.readFile(path.join(root, file), 'utf8');
export async function editConfig(
  root: string,
  edit: (config: Config) => void,
): Promise<void> {
  const config = await loadConfig(root);
  edit(config);
  await put(root, CONFIG, serializeConfig(config));
}
