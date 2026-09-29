# RulesKit

One reviewed source of project instructions for multiple AI coding agents.

RulesKit scans repository evidence, stores it in readable YAML, and generates agent-specific instruction files. It distinguishes detected facts, inferred conventions and your own rules. It runs locally without an API key, telemetry or a cloud service.

For example, a React repository with `compilerOptions.strict: true`, Vitest and an existing `src/lib/api.ts` gets strict-mode and test-tool guidance plus a **labeled inference** to inspect the possible shared API client. A Cargo project gets Cargo-specific evidence instead. RulesKit does not invent universal style policies.

## Install

Requires **Node.js 22 or later** and npm. This initial release is distributed from source; it has **not been published to the npm registry**. Do not assume `npx ruleskit` installs this project.

```sh
git clone https://github.com/irrumi/RulesKit.git
cd RulesKit
npm ci
npm run build
node dist/cli.js --help
```

To install the built package's `ruleskit` command:

```sh
npm pack
npm install --global ./irrumi-ruleskit-0.1.0.tgz
ruleskit --help
```

Alternatively use `node /path/to/RulesKit/dist/cli.js` in place of `ruleskit`, or pass `--root /path/to/your/project` from the checkout. The intended npm package name is `@irrumi/ruleskit`; registry publication is a separate release step.

## Quick start

From the project you want to document:

```sh
ruleskit scan
ruleskit init
# Review .ruleskit/config.yaml; select agents and add userRules.
ruleskit generate --dry-run
ruleskit generate
ruleskit audit
```

Commit `.ruleskit/config.yaml`, `.ruleskit/state.json` and the selected agent files together. After changing dependencies or project structure:

```sh
ruleskit sync --refresh --dry-run
ruleskit sync --refresh
ruleskit audit
```

For existing instructions, init preserves them. Review `ruleskit generate --merge --dry-run`, then explicitly use `--merge` to append managed blocks. See [migration and recovery](docs/configuration.md#migrating-existing-instructions).

## Commands

| Command    | Behavior                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------- |
| `init`     | Analyze the repository and create canonical config; never writes agent instructions.          |
| `scan`     | Read-only, deterministic evidence report; `--json` includes provenance and fingerprints.      |
| `generate` | Render the saved canonical config into agent files.                                           |
| `sync`     | Reconcile outputs with canonical config; `--refresh` explicitly rescans first.                |
| `audit`    | Check input/structure drift, config changes, missing/edited/stale output and known shadowing. |

All commands accept `--root` and `--json`. `init`, `generate` and `sync` accept `--dry-run`; the preview includes unified diffs and writes nothing. `generate`/`sync` accept `--merge` and `--overwrite-generated`. `--yes` is accepted for scripted workflows; commands are non-interactive and it **never grants overwrite permission**. `--refresh` is exclusive to `sync`.

Exit codes: **0** success/synchronized, **1** stale audit, **2** invalid input, unsafe operation or filesystem failure. JSON errors go to stderr. Parse failures in supported manifests are scan warnings and make audit stale; an empty/unknown stack is not itself an error.

## Supported agents

| Agent          | Output                            |
| -------------- | --------------------------------- |
| Claude Code    | `CLAUDE.md`                       |
| OpenAI Codex   | `AGENTS.md`                       |
| Gemini CLI     | `GEMINI.md`                       |
| Cursor         | `.cursor/rules/ruleskit.mdc`      |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Windsurf       | `.windsurf/rules/ruleskit.md`     |

Choose only the agents you use. Formats were researched against official documentation on 2026-09-29. Current Windsurf documentation redirects to Devin Desktop, which prefers `.devin/rules` and retains `.windsurf/rules` as a fallback. RulesKit reports detected shadowing. See [compatibility decisions and primary sources](docs/compatibility.md); emitted file compatibility does not guarantee agent behavior.

## Detection coverage

| Area                     | Implemented evidence                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| JavaScript/TypeScript    | `package.json`, npm/pnpm/yarn/Bun lockfile presence, package-manager declaration, workspace manifests, JSONC tsconfigs and explicit strict mode. |
| Frontend/backend         | Declared React, Next.js, Vue, Svelte, Express, NestJS; Python Django, DRF, FastAPI, Flask; Rust axum, actix-web, tokio.                          |
| Python                   | `pyproject.toml` project/optional/development/Poetry dependency groups, requirements files, uv/Poetry locks.                                     |
| Rust                     | Cargo package/workspace/dependency tables, lockfile and rustfmt config.                                                                          |
| Tests and quality        | Vitest, Jest, Playwright, node:test script detection, pytest, Ruff, Black, mypy, ESLint, Prettier, TypeScript; Cargo test tooling.               |
| Data/API                 | Declared Prisma, SQLAlchemy, sqlx, Diesel, DRF; labeled API-client filename inference.                                                           |
| Structure/infrastructure | Scoped manifests, component/test/model/migration/backend/frontend directories, Docker, Compose, GitHub Actions, commitlint config presence.      |
| Basic additional signals | Source extensions for Go/Java/Kotlin/C/C++; Go module, Maven, Gradle, CMake and PlatformIO file presence (not full semantic parsing).            |

Detection runs without executing scripts or configuration modules. Conflicting package managers produce a warning and suppress a confident command-runner choice. Manifest detection means **declared**, not verified running or installed. [Scan boundaries](docs/configuration.md#scan-boundaries) describe ignores and limits.

## Canonical configuration

`init` creates the full versioned snapshot. This shortened excerpt illustrates its shape; keep the generated fingerprint fields when editing:

```yaml
version: 1
agents: [claude, codex, cursor]
detected:
  facts:
    - id: framework:.:React
      category: framework
      value: React
      scope: .
      evidence: [package.json]
      confidence: fact
  # init also supplies inputs, structureHash, warnings, existingInstructions
disabledRules: []
userRules:
  - id: stable-api
    text: Preserve the documented JSON response fields in the billing API.
    scope: apps/backend
```

Strict validation rejects unsupported versions, unknown keys, duplicate IDs and invalid paths. Ordinary sync preserves the config file, including comments. Refresh replaces the detected snapshot while retaining user rules, disabled IDs and agent choices; YAML formatting/comments are rewritten. [Configuration reference](docs/configuration.md).

## Safe synchronization

- Existing human files require explicit `--merge`; original text is preserved outside managed markers.
- Edits inside managed blocks stop sync. Move desired changes into canonical `userRules`, then preview `--overwrite-generated` before applying it.
- Every output is validated before the first replacement. Paths are confined to the target root; symbolic links/junctions are refused for writes. A lock prevents simultaneous RulesKit writers.
- Identical output is not rewritten. State and output are deterministic; no timestamps or absolute checkout paths are embedded.
- Each file uses atomic replacement. A set of files is not one filesystem transaction; restore config/state/outputs together after an interrupted partial write.
- RulesKit never deletes agent files. Deselected outputs remain reported until you manually archive/remove their managed blocks.

Keep the target repository under version control and review diffs. This is a developer tool for a stable local working tree, not a sandbox against hostile concurrent filesystem changes.

## CI

Install RulesKit once from the built tarball and commit your project's generated config/state/files. For a consuming project with that tarball checked into `tools/`, a minimal job is:

```yaml
name: Rules audit
on: [push, pull_request]
permissions:
  contents: read
jobs:
  rules:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npm install --global ./tools/irrumi-ruleskit-0.1.0.tgz
      - run: ruleskit audit --json
```

Generate the initial snapshot **after** adding CI/tooling files so they are part of the accepted baseline. Audit never repairs files in CI. The project's own [CI workflow](.github/workflows/ci.yml) checks formatting, lint, types, tests, build and clean packaged installation across Windows, macOS and Linux.

## Development

```sh
npm ci
npm run check
npm run smoke
```

The scanner, typed evidence model, config parser, pure rule generators, agent adapters, safe writer and audit engine are separate modules. [Architecture and extension guide](docs/architecture.md) explains adding detectors, adapters and generators. [Contributing](CONTRIBUTING.md) describes validation and pull requests. MIT licensed.

## Limits and roadmap

v0.1 supports scoped evidence in one root config and repository-wide agent files. It does not infer arbitrary architecture from source code, resolve inherited tsconfigs, interpret arbitrary build scripts, enforce agent behavior, auto-merge contradictory rules, read global agent preferences or support Antigravity. Changes to source bodies alone do not trigger drift; relevant manifest/config content and included path additions/removals do. Large snapshots fail explicit size limits instead of silently truncating instructions.

Next priorities: path-scoped agent output, richer per-workspace detection, reviewed config migrations, native Devin support and a separately verified npm registry release. Telemetry, accounts, hosted dashboards and paid AI dependencies are outside the local CLI's scope.
