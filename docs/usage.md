# Installation and CLI guide

## Install from source

Requires Node.js 22+, npm and Git. Version 0.1 is distributed from source; `@irrumi/ruleskit` has not been published to npm.

```sh
git clone https://github.com/irrumi/RulesKit.git
cd RulesKit
npm ci
npm run build
node dist/cli.js --help
node dist/cli.js scan --root .
```

The last command is read-only and inspects the checkout. Pass an existing directory with `--root` to inspect another project; quote paths containing spaces. Git history is not required in the target directory.

## Install the CLI command

From the built source checkout:

```sh
npm pack
npm install --global ./irrumi-ruleskit-0.1.0.tgz
ruleskit --help
```

This installs your local build, not a registry release. Use the filename returned by `npm pack` if the package version changes. npm's global executable directory must be on your `PATH`.

If your global npm prefix is not writable, keep using the built entry point without a global install. Replace both paths below:

```sh
node "/path/to/RulesKit/dist/cli.js" scan --root "/path/to/project"
```

## Commands and flags

| Command    | Behavior                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------- |
| `init`     | Analyze the repository and create canonical config; never writes agent instructions.          |
| `scan`     | Read-only, deterministic evidence report; `--json` includes provenance and fingerprints.      |
| `generate` | Render the saved canonical config into agent files.                                           |
| `sync`     | Reconcile outputs with canonical config; `--refresh` explicitly rescans first.                |
| `audit`    | Check input/structure drift, config changes, missing/edited/stale output and known shadowing. |

All commands accept `--root` and `--json`. The default root is the current working directory.

| Option                  | Applies to                 | Behavior                                                                                       |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `--dry-run`             | `init`, `generate`, `sync` | Preview changes, including unified diffs, without writing.                                     |
| `--merge`               | `generate`, `sync`         | Explicitly append managed blocks to existing human files.                                      |
| `--overwrite-generated` | `generate`, `sync`         | Explicitly replace edited, trusted managed blocks.                                             |
| `--refresh`             | `sync`                     | Rescan and replace detected evidence before generating.                                        |
| `--yes`                 | All commands               | Accepted for scripts; commands are already non-interactive. Never grants overwrite permission. |
| `--help`, `-h`          | CLI                        | Show command help.                                                                             |
| `--version`             | CLI                        | Show the version.                                                                              |

Exit codes: **0** success/synchronized, **1** stale audit, **2** invalid input, unsafe operation or filesystem failure. JSON errors go to stderr. Parse failures in supported manifests are scan warnings and make audit stale; an empty or unknown stack is not itself an error.

Ordinary sync preserves configuration text, including comments. Refresh replaces the detected snapshot while retaining user rules, disabled rule IDs and agent choices; YAML formatting/comments are rewritten. Unchanged outputs are not rewritten. State and output contain no timestamps or absolute checkout paths.

## Existing instructions

After installing the CLI, run inside the target project:

```sh
ruleskit init
# Review .ruleskit/config.yaml.
ruleskit generate --merge --dry-run
ruleskit generate --merge
ruleskit audit
```

Merge appends a managed block; it does not reconcile contradictory prose. Existing text and LF/CRLF line endings are preserved outside managed blocks. Format-specific frontmatter requirements can cause an existing file to be rejected instead of modified. Legacy instruction files are left in place and reported when they may shadow generated output.

Move desired edits inside managed blocks into canonical `userRules` before previewing `--overwrite-generated`. See [migration and recovery](configuration.md#migrating-existing-instructions).

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

Detection runs without executing scripts or configuration modules. Conflicting package managers produce a warning and suppress a confident command-runner choice. Manifest detection means **declared**, not verified running or installed.

The scanner applies built-in exclusions, nested `.gitignore` rules and root `.ruleskitignore` rules. It does not follow symbolic links or junctions. See [scan boundaries](configuration.md#scan-boundaries) for limits and ignored paths. Large snapshots fail explicit size limits instead of silently truncating instructions.

## CI audit in a consuming project

Install RulesKit from the built tarball and commit your project's generated config, state and agent files. With the tarball checked into `tools/`, a minimal job is:

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

Ensure your consuming project's ignore rules allow committing the tarball. Generate the initial snapshot **after** adding CI/tooling files so they are part of the accepted baseline. Audit never repairs files in CI. Resolve drift locally, review the changes, and commit config/state/outputs together.

RulesKit's own [CI workflow](../.github/workflows/ci.yml) checks formatting, lint, types, tests, build and clean packaged installation across Windows, macOS and Linux.

## Development

```sh
npm ci
npm run check
npm run smoke
```

The smoke test packs and installs a fresh production copy, so it needs access to the npm registry. For module responsibilities and extension points, see the [architecture guide](architecture.md). For pull request requirements, see [CONTRIBUTING.md](../CONTRIBUTING.md).
