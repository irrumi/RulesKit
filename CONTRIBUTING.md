# Contributing

Use a current Node.js 22+ release and npm. Clone the repository, create a branch, run `npm ci`, then `npm run check` and `npm run smoke`. The latter packs and installs into a temporary directory, requiring npm registry access for production dependencies. `npm run format` applies formatting.

For a change, add focused tests and update documentation when behavior changes. Submit a pull request explaining the user-visible problem, resulting behavior, compatibility considerations and commands actually tested. Do not include build output, credentials, `node_modules` or temporary fixture repositories. Keep the lockfile updated when dependencies change.

See [architecture](docs/architecture.md) for detector, adapter and rule-generator contracts. New adapters need current official documentation links and migration tests. New detectors must attach repository evidence and separate inference from fact. Keep core operations local and deterministic; do not execute repository configuration or introduce telemetry or API keys.

Safety checks are product behavior. Never bypass ownership checks, path validation or errors to make tests pass. Filesystem tests must use freshly created temporary directories and clean up only those directories. Test link/junction refusal on Windows as well as POSIX when changing the writer.

Before release, run the complete checks and packaged smoke test, inspect `npm pack --dry-run`, review the diff and secrets exposure, and verify the CI matrix. npm registry publication is a separate maintainer operation; the source checkout is not evidence of registry availability. Update compatibility dates only after reading the official sources again.
