# Architecture and extension points

RulesKit is a local TypeScript CLI for Node.js 22+. It never calls an LLM, executes repository scripts or config modules, or contacts a service during CLI operations. npm installation uses the normal package registry.

```text
repository -> scanner + detectors -> evidence snapshot
                                      |
                              .ruleskit/config.yaml
                                      |
                                rule generators
                                      |
                                 agent adapters
                                      |
                            preflight -> atomic writes
                                      |
                              .ruleskit/state.json

audit: current scan + canonical config + expected output + saved state
```

## Modules

| Module             | Contract                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `src/model.ts`     | Strict versioned Zod schemas for facts, configuration and state.                                         |
| `src/scanner.ts`   | Bounded deterministic traversal, ignore processing, evidence hashing, detector registry.                 |
| `src/detectors/`   | Manifest and file-presence detectors; `Detector` / `DetectionContext` interface.                         |
| `src/generator.ts` | Pure `Config -> Rule[] -> Markdown`; facts, inferences and user rules remain distinct.                   |
| `src/adapters.ts`  | Agent paths, frontmatter, budgets, deterministic body generation and validation.                         |
| `src/core/fs.ts`   | Relative path validation, link refusal, optimistic concurrency, atomic file replacement and writer lock. |
| `src/core/sync.ts` | Init, whole-plan validation, migration choices, diff preview and synchronization.                        |
| `src/audit.ts`     | Read-only comparisons and structured drift issues.                                                       |
| `src/cli.ts`       | Argument validation, exit codes, human/JSON presentation.                                                |

## Decisions

- **YAML + strict runtime schema:** readable local customization without executable configuration. Unknown keys, unsupported versions, duplicates and invalid paths fail explicitly. `sync --refresh` rewrites YAML, including comments/formatting; normal `sync` leaves the config file intact.
- **Evidence before advice:** a dependency declaration is a fact about a manifest, not proof of runtime use. API-client naming is only an inference. TypeScript strict advice requires explicit `strict: true`; it is never invented for all TypeScript repositories. No Git-history heuristics assume conventional commits; only commitlint configuration presence is reported.
- **Explicit refresh:** ordinary generation uses the canonical snapshot. A changing working tree cannot silently redefine the accepted rules. Audit reports drift; refresh is a separate opt-in operation.
- **Markers + state:** generated body hashes protect manual edits. Content outside the body is not owned. Canonical config hashes are semantic (key order/comments alone do not cause drift); manifest hashes normalize CRLF. Source path inventories detect additions/removals, not arbitrary source-body changes.
- **Safety before convenience:** outputs use fixed adapter paths. Links/junctions are skipped on traversal and rejected on write/read paths used by synchronization. Writes are preflighted for the full plan, then individually replaced with a flushed sibling temporary file. Existing mode bits are retained where the OS supports them. An exclusive `.ruleskit/write.lock` serializes cooperating writers.

Writes are atomic **per file**, not a repository-wide transaction. A disk failure can leave a partial update; audit reports inconsistencies. Restore the previous config/state/managed files together from version control, then retry. This is not a defense against a malicious process actively swapping filesystem objects between system calls. Stop concurrent tools modifying the target paths. No output directories/files are deleted by synchronization.

## Add a detector

1. Implement `Detector` from `src/detectors/types.ts`, with a stable `id` and async `detect(context)`.
2. Use `context.files` (sorted relative paths), `context.read(file)` (bounded, automatically fingerprinted) and `context.add(category, value, evidenceFile, confidence)`.
3. Prefer parsed JSON/TOML/YAML. Never import or execute repository configuration. Do not store command bodies, credentials, absolute paths or timestamps in facts.
4. Register it in the default detector list in `scan`. Tests can inject a custom list without changing the CLI.
5. Add representative, malformed and conflicting fixtures; validate deterministic repeated scans. Change `factSchema` deliberately if a new category is necessary.

Fact IDs are stable combinations of category, scope and value. They are used in `disabledRules`; changing them is a configuration migration concern.

## Add an adapter

1. Add the agent ID to `agentIds`, then implement/register an `AgentAdapter` in `src/adapters.ts` with a fixed path, preamble, byte budget, `generate` and `validate`.
2. Research current official instruction discovery; update `docs/compatibility.md` with dated primary sources.
3. Keep filesystem mutation in the shared synchronization layer. Do not bypass the managed-block checks.
4. Add tests for headers, pre-existing content, manual edits, size budgets and repeated sync. No arbitrary adapter code is loaded from target repositories in v1.

## Add a rule generator

Implement `RuleGenerator`, a pure function of `Config`. Return rules with stable IDs, relative scopes, evidence paths and explicit `origin`. Add it to `generateRules`' default list, or inject it in a unit test. User rules and disabled generated IDs are combined centrally. Recommendations without evidence belong in user rules, not fabricated detected facts.

## Test strategy

`test/fixtures/repositories.json` holds file maps materialized into isolated temporary repositories: React/TypeScript, Django, Rust, a mixed workspace, existing instructions and an empty project. This avoids mistaking fixtures for real manifests when RulesKit scans itself. Unit/integration tests cover parsing, generation, all adapters, drift, symlinks/junctions, locks and protected writes. `scripts/smoke.mjs` installs the actual packed tarball without development dependencies, executes its bin shim, then runs all fixture lifecycles.
