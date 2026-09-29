import { adapters, extractBlock } from './adapters.js';
import { loadConfig, loadState } from './config.js';
import { hash, readOptional, rootPath, stable } from './core/fs.js';
import { scan } from './scanner.js';

export interface AuditResult {
  status: 'synchronized' | 'stale';
  issues: { code: string; path: string; message: string }[];
  warnings: string[];
}
export async function audit(target: string): Promise<AuditResult> {
  const root = await rootPath(target),
    config = await loadConfig(root),
    state = await loadState(root),
    current = await scan(root);
  const issues: AuditResult['issues'] = [];
  const add = (code: string, path: string, message: string) =>
    issues.push({ code, path, message });
  if (!state)
    add('missing-state', '.ruleskit/state.json', 'Run ruleskit generate.');
  else if (state.configHash !== hash(stable(config)))
    add(
      'config-changed',
      '.ruleskit/config.yaml',
      'Canonical configuration changed; run ruleskit sync.',
    );
  for (const file of [
    ...new Set([
      ...Object.keys(current.inputs),
      ...Object.keys(config.detected.inputs),
    ]),
  ].sort())
    if (current.inputs[file] !== config.detected.inputs[file])
      add(
        'input-changed',
        file,
        'Repository evidence changed; review ruleskit sync --refresh --dry-run.',
      );
  if (current.structureHash !== config.detected.structureHash)
    add(
      'structure-changed',
      '.',
      'Repository file layout changed; refresh detected evidence.',
    );
  if (stable(current.facts) !== stable(config.detected.facts))
    add(
      'facts-changed',
      '.',
      'Detected stack or conventions changed; refresh detected evidence.',
    );
  const paths = new Set(config.agents.map((id) => adapters[id].path));
  for (const file of Object.keys(state?.outputs ?? {})) {
    if (paths.has(file)) continue;
    const text = await readOptional(root, file);
    if (text !== null && extractBlock(text))
      add(
        'orphan-output',
        file,
        'Deselected agent output remains. Archive/remove its managed block manually.',
      );
  }
  for (const id of config.agents) {
    const adapter = adapters[id],
      text = await readOptional(root, adapter.path);
    if (text === null) {
      add('missing-output', adapter.path, 'Generated file is missing.');
      continue;
    }
    try {
      adapter.validate(text);
      const block = extractBlock(text);
      if (!block) {
        add(
          'unmanaged-output',
          adapter.path,
          'No managed block; existing content is protected.',
        );
        continue;
      }
      const actual = hash(block.block.replaceAll('\r\n', '\n'));
      if (state && !state.outputs[adapter.path])
        add(
          'untracked-output',
          adapter.path,
          'Managed block has no ownership entry in saved state; restore matching state.',
        );
      if (
        state?.outputs[adapter.path] &&
        actual !== state.outputs[adapter.path]
      )
        add(
          'output-edited',
          adapter.path,
          'Managed block was edited since generation.',
        );
      if (actual !== hash(adapter.generate(config)))
        add(
          'output-stale',
          adapter.path,
          'Managed block disagrees with canonical configuration.',
        );
    } catch (error) {
      add('invalid-output', adapter.path, (error as Error).message);
    }
  }
  for (const warning of current.warnings)
    if (warning.startsWith('Cannot parse'))
      add('incomplete-scan', '.', warning);
  if (
    config.agents.includes('codex') &&
    current.existingInstructions.includes('AGENTS.override.md')
  )
    add(
      'shadowed-output',
      'AGENTS.override.md',
      'Codex loads this override instead of generated AGENTS.md.',
    );
  if (
    config.agents.includes('windsurf') &&
    current.existingInstructions.some((f) => f.startsWith('.devin/rules/'))
  )
    add(
      'shadowed-output',
      '.devin/rules',
      'Current Devin Desktop prefers this directory to the Windsurf fallback.',
    );
  return {
    status: issues.length ? 'stale' : 'synchronized',
    issues,
    warnings: current.warnings,
  };
}
