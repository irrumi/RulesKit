import { createTwoFilesPatch } from 'diff';
import { adapters, extractBlock } from '../adapters.js';
import {
  CONFIG,
  STATE,
  loadConfig,
  loadState,
  serializeConfig,
} from '../config.js';
import { configSchema, type Config, type State } from '../model.js';
import { scan } from '../scanner.js';
import {
  atomicWrite,
  hash,
  readOptional,
  rootPath,
  stable,
  withLock,
  type Change,
} from './fs.js';

export interface SyncOptions {
  dryRun?: boolean;
  merge?: boolean;
  overwriteGenerated?: boolean;
  refresh?: boolean;
}
export interface Plan {
  changes: Change[];
  warnings: string[];
}
export function preview(plan: Plan): string {
  return plan.changes
    .filter((c) => c.before !== c.after)
    .map((c) =>
      createTwoFilesPatch(
        `a/${c.path}`,
        `b/${c.path}`,
        c.before ?? '',
        c.after,
        '',
        '',
        { context: 3 },
      ),
    )
    .join('\n');
}
export async function init(
  target: string,
  options: { dryRun?: boolean } = {},
): Promise<Plan> {
  const root = await rootPath(target);
  const action = async () => {
    if ((await readOptional(root, CONFIG)) !== null)
      throw new Error(
        'RulesKit is already initialized. Use sync --refresh to update detected evidence.',
      );
    const detected = await scan(root);
    const config = configSchema.parse({
      version: 1,
      agents: Object.keys(adapters),
      detected,
      userRules: [],
      disabledRules: [],
    });
    const plan = {
      changes: [{ path: CONFIG, before: null, after: serializeConfig(config) }],
      warnings: [
        ...detected.warnings,
        ...detected.existingInstructions.map(
          (file) =>
            `Existing instructions preserved: ${file}. Review generate --merge --dry-run before opting into a managed block.`,
        ),
      ],
    };
    if (!options.dryRun)
      for (const change of plan.changes) await atomicWrite(root, change);
    return plan;
  };
  return options.dryRun ? action() : withLock(root, action);
}
export async function planOutputs(
  root: string,
  config: Config,
  state: State | null,
  options: SyncOptions,
): Promise<Plan> {
  const changes: Change[] = [],
    warnings = [...config.detected.warnings];
  const selected = config.agents.map((id) => adapters[id]);
  const selectedPaths = new Set(selected.map((a) => a.path));
  for (const old of Object.keys(state?.outputs ?? {})) {
    if (selectedPaths.has(old)) continue;
    const text = await readOptional(root, old);
    if (text !== null && extractBlock(text)) {
      throw new Error(
        `Deselected output still exists: ${old}. Archive/remove its managed block manually before syncing; RulesKit never deletes instruction files.`,
      );
    }
  }
  const next: State = {
    version: 1,
    configHash: hash(stable(config)),
    outputs: {},
  };
  for (const adapter of selected) {
    const before = await readOptional(root, adapter.path);
    const block = adapter.generate(config);
    let after: string;
    if (before === null) after = adapter.preamble + block + '\n';
    else {
      const existing = extractBlock(before);
      if (existing) {
        const previousHash = state?.outputs[adapter.path];
        if (!previousHash)
          throw new Error(
            `${adapter.path}: managed markers exist without trusted state. Restore .ruleskit/state.json or move this file aside before generating.`,
          );
        if (
          hash(existing.block.replaceAll('\r\n', '\n')) !== previousHash &&
          !options.overwriteGenerated
        )
          throw new Error(
            `${adapter.path}: generated block was edited. Move intentional edits into userRules, then use --overwrite-generated (preview with --dry-run).`,
          );
        after =
          before.slice(0, existing.start) + block + before.slice(existing.end);
      } else {
        if (state?.outputs[adapter.path])
          throw new Error(
            `${adapter.path}: managed block was removed; refusing to adopt the remaining content.`,
          );
        if (!options.merge)
          throw new Error(
            `${adapter.path}: existing instructions are protected. Use --merge --dry-run to preview appending a managed block.`,
          );
        adapter.validate(before);
        after = before + (before.endsWith('\n') ? '\n' : '\n\n') + block + '\n';
      }
    }
    adapter.validate(after);
    next.outputs[adapter.path] = hash(block);
    changes.push({ path: adapter.path, before, after });
  }
  changes.push({
    path: STATE,
    before: await readOptional(root, STATE),
    after: JSON.stringify(next, null, 2) + '\n',
  });
  return { changes, warnings };
}
export async function sync(
  target: string,
  options: SyncOptions = {},
): Promise<Plan> {
  const root = await rootPath(target);
  const action = async () => {
    const rawConfig = await readOptional(root, CONFIG);
    const config = await loadConfig(root);
    const state = await loadState(root);
    if (options.refresh) config.detected = await scan(root);
    const plan = await planOutputs(root, config, state, options);
    if (options.refresh)
      plan.changes.unshift({
        path: CONFIG,
        before: rawConfig,
        after: serializeConfig(config),
      });
    // Complete validation before the first replacement. Each write checks again.
    if ((await readOptional(root, CONFIG)) !== rawConfig)
      throw new Error('Configuration changed during operation; retry.');
    for (const change of plan.changes)
      if ((await readOptional(root, change.path)) !== change.before)
        throw new Error(`File changed during operation: ${change.path}`);
    if (!options.dryRun)
      for (const change of plan.changes) await atomicWrite(root, change);
    return plan;
  };
  return options.dryRun ? action() : withLock(root, action);
}
