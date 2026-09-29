# Configuration and synchronization

Run `ruleskit init` to create a complete valid `.ruleskit/config.yaml`. Commit it together with `.ruleskit/state.json` and the generated instructions after reviewing them. Do not hand-edit the state file.

| Field                           | Purpose                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `version`                       | Required literal `1`; unsupported versions fail instead of guessing a migration.     |
| `agents`                        | Nonempty, unique list: `claude`, `codex`, `gemini`, `cursor`, `copilot`, `windsurf`. |
| `detected.facts`                | IDs, categories, values, scopes, evidence paths, confidence (`fact` or `inference`). |
| `detected.inputs`               | Relative manifest/config/lockfile paths and SHA-256 hashes.                          |
| `detected.structureHash`        | Hash of the sorted, included non-instruction file path inventory.                    |
| `detected.warnings`             | Parse failures, conflicting signals and known compatibility concerns.                |
| `detected.existingInstructions` | Inventory captured at the last init/refresh; bodies are not imported.                |
| `disabledRules`                 | IDs of detected rules to omit from every adapter.                                    |
| `userRules`                     | Reviewed rules with unique `id`, `text`, and optional `scope` (default `.`).         |

Paths are relative POSIX paths, even on Windows. Use `.` for repository-wide rules. Directory scopes are written into the instruction text; v1 does not create separate per-directory rule files. User rules are included in their configured order. Generated rule IDs appear in `detected.facts`; language-only facts do not currently generate advice.

Example customization (replace these fields inside a generated config, retaining the complete `detected` snapshot):

```yaml
agents: [claude, codex, cursor]
disabledRules:
  - 'directory:src/components:src/components'
userRules:
  - id: public-api
    text: Preserve the documented JSON response fields in the billing API.
    scope: apps/backend
```

`sync --refresh` replaces `detected` only, retaining agents, user rules and disabled IDs. YAML comments and formatting are rewritten by refresh. Normal `generate` and `sync` are intentionally equivalent and render the saved snapshot without scanning; `audit` is the command that checks whether a refresh is needed. A syntax-invalid config causes exit 2 before output replacement.

## Migrating existing instructions

1. `ruleskit init` inventories instructions and writes only canonical config.
2. Review the generated facts and selected agents. Copy desired human instructions into `userRules` if they should be shared across agents. Remove duplicates manually after review.
3. Run `ruleskit generate --merge --dry-run`. For compatible targets it previews appending a generated block while retaining every original byte.
4. Run `ruleskit generate --merge` to apply it. Future syncs update only the body between `<!-- ruleskit:begin -->` and `<!-- ruleskit:end -->`.

RulesKit does not semantically reconcile contradictory human/generated instructions. Review the diff. `--merge` applies to all selected existing targets; reduce `agents` first if you want a narrower migration. Differing Cursor/Windsurf frontmatter is rejected rather than merged. Legacy or other named rule files are inventoried and untouched.

## Resolving drift and conflicts

- **Repository changed:** review `ruleskit sync --refresh --dry-run`, then run `ruleskit sync --refresh` and commit the result.
- **Canonical rules changed:** run `ruleskit sync --dry-run`, then `ruleskit sync`.
- **Generated body edited:** preserve intentional changes in `userRules`; preview with `ruleskit sync --overwrite-generated --dry-run`, then apply `ruleskit sync --overwrite-generated`. This flag never overwrites arbitrary human files, bypasses malformed markers or restores missing trust state.
- **Generated file missing:** sync recreates that selected output.
- **Ownership marker missing/corrupt:** restore the previous file or move it aside before regenerating. RulesKit cannot safely infer the previous ownership boundaries.
- **State missing/corrupt:** restore `.ruleskit/state.json` from Git with matching outputs. Without it, existing markers are not proof of ownership. For deliberate reset, back up/move the managed files and state aside, keep the canonical config, and generate into absent paths.
- **Agent removed from config:** its tracked output is reported as an orphan and sync refuses to silently leave active stale rules. Manually archive/remove its managed block (keep human sections), then sync. If the file has activation frontmatter but no human content, archive the entire file.
- **Stale writer lock:** only when no RulesKit process is active, remove `.ruleskit/write.lock` and retry.

## Scan boundaries

The scanner honors root/nested `.gitignore` and a root `.ruleskitignore` with Git-style patterns. Ignored directories are pruned. Like Git, an ignored parent must be re-included before a nested child can be considered. Scanning is filesystem-based: ignored files are excluded even if Git tracks them. Global Git excludes and `.git/info/exclude` are not loaded.

Always excluded: `.git`, `.ruleskit`, `.codebase-memory`, dependency/build/cache directories (`node_modules`, `vendor`, `dist`, `build`, `target`, `.next`, `coverage`, `.cache`, Python environments/caches), `.env*`, common private-key formats, archives and temporary files. Use `.ruleskitignore` to exclude examples or generated directories specific to your repository. No symlinks/junctions are followed.

Limits: 100,000 entries, depth 40, 16 MiB per scanned evidence file, 4 MiB per config/state/instruction input, 32,000 bytes per generated output (12,000 for Windsurf). Exceeding a limit aborts with a diagnostic instead of accepting a silently truncated snapshot. Reduce scope/rules or use fewer agents. Empty or unsupported repositories still accept user-defined rules.

Text inputs must be UTF-8; invalid encodings are refused rather than silently converted. Text manifest/config hashes normalize CRLF to LF; binary `bun.lockb` files are fingerprinted byte-for-byte. Existing CRLF managed blocks are preserved when their content is unchanged. Source-body edits are not fingerprinted: adding/removing/renaming an included file changes the structure hash, but changing only a function implementation does not. No AST/call graph, inherited TypeScript config resolution, general dependency resolution, database connection inspection, remote CI status or runtime architecture verification is performed.
