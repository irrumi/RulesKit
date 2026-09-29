# RulesKit

**Generate and sync project-specific instructions for six AI coding agents from one reviewed YAML configuration.**

Stop maintaining separate rule files by hand. RulesKit detects repository evidence, labels uncertain conventions, and checks when your instructions need updating. It runs locally without API keys or telemetry.

[![CI](https://github.com/irrumi/RulesKit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/irrumi/RulesKit/actions/workflows/ci.yml) · [MIT license](LICENSE)

## Quick start

Requires **Node.js 22+**, npm and Git. Tested on **Windows, macOS and Linux**.

**v0.1 is available from source only:** there is no published npm package or GitHub release yet.

```sh
git clone https://github.com/irrumi/RulesKit.git
cd RulesKit
npm ci
npm run build
node dist/cli.js scan --root .
```

This inspects RulesKit's own repository without changing files. To inspect yours, replace `.` with its directory. Run `node dist/cli.js --help` for all commands.

### Generate instructions for your project

Stay in the RulesKit checkout. Replace `../your-project` with an existing repository path:

```sh
node dist/cli.js init --root "../your-project"
# Review your project's .ruleskit/config.yaml; choose agents and add rules.
node dist/cli.js generate --root "../your-project" --dry-run
node dist/cli.js generate --root "../your-project"
node dist/cli.js audit --root "../your-project"
```

`init` writes only the canonical configuration. With all six agents selected and no existing instruction files, `generate` prints:

```text
Created CLAUDE.md
Created AGENTS.md
Created GEMINI.md
Created .cursor/rules/ruleskit.mdc
Created .github/copilot-instructions.md
Created .windsurf/rules/ruleskit.md
Created .ruleskit/state.json
```

A clean audit prints `RulesKit: synchronized` and exits with code **0**. Existing instruction files stop generation unless you explicitly merge; see [migration and recovery](docs/configuration.md#migrating-existing-instructions).

Prefer the shorter `ruleskit` command? [Install the built CLI locally](docs/usage.md#install-the-cli-command). `npx ruleskit` is not a distribution method for this project.

## Why RulesKit?

A project used with several coding agents can accumulate several copies of the same instructions. Dependency changes, new directories and manual edits make those copies drift apart. RulesKit gives you one configuration to review, generates the selected agent files, and reports drift before stale instructions go unnoticed.

- **Ground rules in evidence.** Keep detected facts, inferred conventions and your own rules distinct.
- **Review before writing.** Preview unified diffs with `--dry-run`; explicitly opt into merging existing files.
- **Keep updates predictable.** Unchanged files stay untouched, and manually edited managed blocks stop synchronization.
- **Check drift in CI.** Use a read-only audit with JSON output and meaningful exit codes.

```text
Repository evidence → .ruleskit/config.yaml → Agent instruction files
                               ↑                      ↓
                         reviewed rules       audit checks for drift
```

For example, explicit TypeScript strict mode is a fact; a file named `src/lib/api.ts` suggests a possible shared API client and is labeled as an inference. RulesKit does not use an LLM to invent project policies.

## Supported agents

| Agent          | Generated file                    |
| -------------- | --------------------------------- |
| Claude Code    | `CLAUDE.md`                       |
| OpenAI Codex   | `AGENTS.md`                       |
| Gemini CLI     | `GEMINI.md`                       |
| Cursor         | `.cursor/rules/ruleskit.mdc`      |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Windsurf       | `.windsurf/rules/ruleskit.md`     |

These are instruction-file adapters, not API integrations. Select only the agents you use.

Windsurf's current documentation redirects to Devin Desktop, which prefers `.devin/rules` and retains `.windsurf/rules` as a fallback. RulesKit reports detected shadowing. See [compatibility decisions and official sources](docs/compatibility.md) for formats, caveats and the research date.

## What it detects

RulesKit reads JavaScript/TypeScript, Python and Rust manifests, including workspace and mixed-language repositories. It detects declared frameworks such as React and Django, test and quality tools, package managers, data libraries, Docker, GitHub Actions and common project directories.

Go, Java, Kotlin and C/C++ have basic filename and source-extension signals only. Manifest evidence means **declared**, not verified installed or running. Scanning does not execute repository scripts or configuration modules.

See the [detection coverage table](docs/usage.md#detection-coverage) and [scan boundaries](docs/configuration.md#scan-boundaries) for the exact inputs and limitations.

## Common workflows

After [installing the CLI command](docs/usage.md#install-the-cli-command), run these inside your target project, or pass `--root`:

| Command                   | Use it to                                           |
| ------------------------- | --------------------------------------------------- |
| `ruleskit scan --json`    | Inspect evidence without writing files.             |
| `ruleskit init`           | Create the canonical configuration for review.      |
| `ruleskit generate`       | Generate instructions from the saved configuration. |
| `ruleskit sync`           | Update instruction files after editing your rules.  |
| `ruleskit sync --refresh` | Rescan repository evidence and update instructions. |
| `ruleskit audit`          | Detect input, configuration and output drift.       |

After changing dependencies or project structure:

```sh
ruleskit sync --refresh --dry-run
ruleskit sync --refresh
ruleskit audit
```

Plain `generate` and `sync` use the saved snapshot; only `sync --refresh` rescans. Exit codes are **0** for success/clean audit, **1** for stale audit, and **2** for errors. See [all flags and a CI example](docs/usage.md).

## Customize your rules

Run `init` first, then edit `.ruleskit/config.yaml`. For example, replace its `agents` and `userRules` fields with the following; retain the generated `version`, `detected` and other fields:

```yaml
agents: [claude, codex, cursor]
userRules:
  - id: stable-api
    text: Preserve the documented JSON response fields in the billing API.
    scope: apps/backend
```

`agents` selects outputs, `userRules` adds your instructions, and `disabledRules` suppresses generated rule IDs. Scopes are included in the instruction text; v0.1 emits repository-wide files, not separate per-directory rules. The [configuration reference](docs/configuration.md) covers validation, refresh behavior and conflict recovery.

## File safety and privacy

- Writes are limited to `.ruleskit/` and the selected agent files inside the target root. The CLI makes no network requests and sends no telemetry; installing npm dependencies requires registry access.
- Existing human files require `--merge`. Text outside managed markers is preserved; edits inside them stop synchronization. `--overwrite-generated` applies only to trusted managed blocks, and `--yes` never grants overwrite permission.
- RulesKit validates the entire write plan, rejects linked write paths, and locks concurrent RulesKit writers. Each replacement is atomic; a multi-file update is not one filesystem transaction.
- **No automatic backups are created.** Commit `.ruleskit/config.yaml`, `.ruleskit/state.json` and selected agent files together before updates. Review diffs and use [recovery instructions](docs/configuration.md#resolving-drift-and-conflicts) if a write is interrupted.
- RulesKit never deletes agent files. Deselected outputs require manual archiving or removal of their managed blocks.

Use a stable local working tree; RulesKit is not a sandbox against hostile concurrent filesystem changes.

## Status and limitations

RulesKit is an early **0.1** CLI. Tests cover generation, file safety and packaged CLI workflows; they do not prove that each live agent loads or follows every instruction.

It does not infer arbitrary architecture from source code, resolve inherited tsconfigs, interpret arbitrary build scripts, merge contradictory rules, read global agent preferences or support Antigravity. Source-body changes alone do not trigger drift; relevant manifest/config content and included path additions/removals do.

**Planned, not implemented:** path-scoped agent output, richer per-workspace detection, reviewed config migrations, native Devin support and a separately verified npm registry release.

## Development and contributing

From the source checkout:

```sh
npm ci
npm run check
npm run smoke
```

`check` runs formatting, lint, type checking, tests and build. `smoke` installs the packed CLI with production dependencies and exercises six repository fixtures. CI runs Node.js 22 on Windows, macOS and Linux, plus Node.js 24 and 26 on Linux.

Contributions to detectors, adapters, tests and documentation are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), the [architecture and extension guide](docs/architecture.md), and the [Code of Conduct](CODE_OF_CONDUCT.md). Licensed under [MIT](LICENSE).
