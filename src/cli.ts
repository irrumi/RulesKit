#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { audit } from './audit.js';
import { init, sync, preview, type Plan } from './core/sync.js';
import { scan } from './scanner.js';

const HELP = `RulesKit 0.1.0 — local, evidence-based agent instructions

Usage: ruleskit <command> [options]

Commands:
  init       Scan and create .ruleskit/config.yaml; preserve instruction files
  scan       Inspect repository evidence without writing
  generate   Render canonical configuration into agent instruction files
  sync       Synchronize instructions; optionally refresh repository evidence
  audit      Check repository drift and generated output (0 clean, 1 stale)

Options:
  --root <path>           Target repository (default: current directory)
  --json                  Machine-readable output
  --dry-run               Preview init/generate/sync with unified diffs; no writes
  --merge                 Append a managed block to existing instructions
  --overwrite-generated   Explicitly replace edits INSIDE tracked managed blocks
  --refresh               Rescan evidence before sync; preserve user rules
  --yes                   Non-interactive acknowledgement; never implies overwrite
  --help, -h              Show this help
  --version               Print version

Invalid input, filesystem errors, or unsafe operations exit 2.
Review repository scripts before executing them. RulesKit never runs them.
`;
function presentPlan(plan: Plan, dryRun: boolean): void {
  for (const w of plan.warnings) console.log(`Warning: ${w}`);
  if (dryRun) console.log(preview(plan) || 'No changes.');
  else {
    for (const c of plan.changes)
      console.log(
        `${c.before === c.after ? 'Unchanged' : c.before === null ? 'Created' : 'Updated'} ${c.path}`,
      );
  }
}
async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      root: { type: 'string' },
      json: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      merge: { type: 'boolean' },
      'overwrite-generated': { type: 'boolean' },
      refresh: { type: 'boolean' },
      yes: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
    },
  });
  if (values.help || (!positionals.length && !values.version)) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log('0.1.0');
    return 0;
  }
  const command = positionals[0];
  if (
    positionals.length !== 1 ||
    !['init', 'scan', 'generate', 'sync', 'audit'].includes(command!)
  )
    throw new Error(
      'Expected one command: init, scan, generate, sync, or audit. See --help.',
    );
  if (values.refresh && command !== 'sync')
    throw new Error('--refresh is only supported by sync.');
  if (
    (values.merge || values['overwrite-generated']) &&
    !['generate', 'sync'].includes(command!)
  )
    throw new Error(
      '--merge and --overwrite-generated require generate or sync.',
    );
  if (values['dry-run'] && ['scan', 'audit'].includes(command!))
    throw new Error(
      `${command} is already read-only; --dry-run is not supported.`,
    );
  const root = values.root ?? process.cwd();
  if (command === 'scan') {
    const result = await scan(root);
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        result.facts.length
          ? 'Repository evidence:'
          : 'No supported repository signals found. Add user-defined rules after init.',
      );
      for (const f of result.facts)
        console.log(
          `  ${f.category}: ${f.value} [${f.scope}; ${f.confidence}] (${f.evidence.join(', ')})`,
        );
      for (const w of result.warnings) console.log(`Warning: ${w}`);
      for (const f of result.existingInstructions)
        console.log(`Existing instructions: ${f}`);
    }
  } else if (command === 'audit') {
    const result = await audit(root);
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`RulesKit: ${result.status}`);
      for (const issue of result.issues)
        console.log(`  ${issue.code}: ${issue.path} — ${issue.message}`);
      for (const w of result.warnings) console.log(`Warning: ${w}`);
    }
    return result.status === 'synchronized' ? 0 : 1;
  } else {
    const options = {
      dryRun: values['dry-run'] ?? false,
      merge: values.merge ?? false,
      overwriteGenerated: values['overwrite-generated'] ?? false,
      refresh: values.refresh ?? false,
    };
    const result =
      command === 'init'
        ? await init(root, options)
        : await sync(root, options);
    if (values.json)
      console.log(
        JSON.stringify(
          {
            dryRun: options.dryRun,
            changes: result.changes
              .filter((c) => c.before !== c.after)
              .map((c) => ({
                path: c.path,
                action: c.before === null ? 'create' : 'update',
              })),
            warnings: result.warnings,
            ...(options.dryRun ? { diff: preview(result) } : {}),
          },
          null,
          2,
        ),
      );
    else presentPlan(result, options.dryRun);
  }
  return 0;
}
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (process.argv.includes('--json'))
      console.error(JSON.stringify({ error: message, exitCode: 2 }));
    else console.error(`RulesKit: ${message}`);
    process.exitCode = 2;
  });
