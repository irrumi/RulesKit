import * as fs from 'node:fs/promises';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import {
  hash,
  readBytes,
  decodeUtf8,
  readOptional,
  rootPath,
} from './core/fs.js';
import { snapshotSchema, type Fact, type Snapshot } from './model.js';
import { nodeDetector } from './detectors/node.js';
import { pythonRustDetector } from './detectors/python-rust.js';
import { structureDetector } from './detectors/structure.js';
import type { Detector } from './detectors/types.js';
import { adapters } from './adapters.js';

const excluded = new Set([
  '.git',
  '.ruleskit',
  '.codebase-memory',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  'target',
  'coverage',
  '.next',
  '.cache',
  'vendor',
]);
export function isInstruction(file: string): boolean {
  return (
    Object.values(adapters).some(
      (adapter) => file === adapter.path || file.endsWith(`/${adapter.path}`),
    ) ||
    /(?:^|\/)(?:AGENTS(?:\.override)?\.md|CLAUDE(?:\.local)?\.md|GEMINI\.md|\.cursorrules|\.windsurfrules)$/.test(
      file,
    ) ||
    /(?:^|\/)(?:\.cursor\/rules\/.*\.mdc|\.(?:windsurf|devin|claude)\/rules\/.*\.md|\.github\/(?:copilot-instructions\.md|instructions\/.*\.instructions\.md))$/.test(
      file,
    )
  );
}
export async function scan(
  target: string,
  detectors: Detector[] = [nodeDetector, pythonRustDetector, structureDetector],
): Promise<Snapshot> {
  const root = await rootPath(target);
  const files: string[] = [],
    warnings: string[] = [],
    instructions: string[] = [];
  const inputs: Record<string, string> = {};
  const read = async (file: string): Promise<string> => {
    const bytes = await readBytes(root, file, 16 * 1024 * 1024);
    if (bytes === null)
      throw new Error(`File disappeared during scan: ${file}`);
    if (path.posix.basename(file) === 'bun.lockb') {
      inputs[file] = hash(bytes);
      return '';
    }
    const value = decodeUtf8(bytes, file);
    inputs[file] = hash(value.replaceAll('\r\n', '\n'));
    return value;
  };
  const customIgnore = ignore();
  if ((await readOptional(root, '.ruleskitignore')) !== null)
    customIgnore.add(await read('.ruleskitignore'));
  let count = 0;
  async function walk(
    dir: string,
    parents: { base: string; matcher: Ignore }[],
    depth: number,
  ): Promise<void> {
    if (depth > 40)
      throw new Error(
        'Scan depth exceeds 40; narrow the repository with .ruleskitignore.',
      );
    const entries = (
      await fs.readdir(path.join(root, dir), { withFileTypes: true })
    ).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const rules = [...parents];
    if (entries.some((e) => e.name === '.gitignore' && e.isFile())) {
      const file = dir ? `${dir}/.gitignore` : '.gitignore';
      rules.push({ base: dir, matcher: ignore().add(await read(file)) });
    }
    for (const entry of entries) {
      if (++count > 100000)
        throw new Error(
          'Scan exceeds 100000 entries; use .ruleskitignore to narrow it.',
        );
      const file = dir ? `${dir}/${entry.name}` : entry.name;
      if (
        excluded.has(entry.name) ||
        /^\.env(?:\.|$)/.test(entry.name) ||
        /\.(?:pem|key|p12|pfx|tgz|tmp)$/.test(entry.name)
      )
        continue;
      if (entry.isSymbolicLink()) {
        warnings.push(`Skipped symbolic link/junction: ${file}`);
        continue;
      }
      const candidate = file + (entry.isDirectory() ? '/' : '');
      if (customIgnore.ignores(candidate)) continue;
      let ignored = false;
      for (const rule of rules) {
        const local = rule.base
          ? candidate.slice(rule.base.length + 1)
          : candidate;
        const result = rule.matcher.test(local);
        if (result.ignored) ignored = true;
        if (result.unignored) ignored = false;
      }
      if (ignored) continue;
      if (entry.isDirectory()) await walk(file, rules, depth + 1);
      else if (entry.isFile()) {
        if (isInstruction(file)) instructions.push(file);
        else files.push(file);
      }
    }
  }
  await walk('', [], 0);
  files.sort();
  const facts = new Map<string, Fact>();
  for (const detector of detectors)
    await detector.detect({
      files,
      read,
      warn: (w) => warnings.push(w),
      add(category, value, file, confidence = 'fact') {
        const scope = path.posix.dirname(file);
        const id = `${category}:${scope}:${value}`;
        const existing = facts.get(id);
        if (existing)
          existing.evidence = [...new Set([...existing.evidence, file])].sort();
        else
          facts.set(id, {
            id,
            category,
            value,
            scope,
            evidence: [file],
            confidence,
          });
      },
    });
  const managers = new Map<string, Set<string>>();
  for (const fact of facts.values())
    if (
      fact.category === 'packageManager' &&
      ['npm', 'pnpm', 'yarn', 'bun'].includes(fact.value)
    ) {
      const set = managers.get(fact.scope) ?? new Set();
      set.add(fact.value);
      managers.set(fact.scope, set);
    }
  for (const [scope, set] of managers)
    if (set.size > 1)
      warnings.push(
        `Conflicting package managers in ${scope}: ${[...set].sort().join(', ')}. No command runner inferred.`,
      );
  if (instructions.includes('AGENTS.override.md'))
    warnings.push(
      'AGENTS.override.md takes precedence over generated AGENTS.md in Codex.',
    );
  if (instructions.some((f) => f.startsWith('.devin/rules/')))
    warnings.push(
      '.devin/rules exists; current Devin Desktop may prefer it over the Windsurf fallback output.',
    );
  return snapshotSchema.parse({
    facts: [...facts.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
    inputs: Object.fromEntries(
      Object.entries(inputs).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    structureHash: hash(files.join('\n')),
    warnings: [...new Set(warnings)].sort(),
    existingInstructions: instructions.sort(),
  });
}
