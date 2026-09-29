# Agent compatibility

Official documentation reviewed on **2026-09-29**. These are file-format integrations, not integrations with remote agent APIs. Tests validate generated files and ownership behavior; they do not launch paid agents or prove model compliance.

| Adapter    | Generated path                    | Format and decision                                                                                               |
| ---------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `claude`   | `CLAUDE.md`                       | Project Markdown; separate file remains useful across Claude Code versions and settings.                          |
| `codex`    | `AGENTS.md`                       | Root project Markdown; do not generate `AGENTS.override.md`, which takes precedence.                              |
| `gemini`   | `GEMINI.md`                       | Default Gemini CLI context file, plain Markdown.                                                                  |
| `cursor`   | `.cursor/rules/ruleskit.mdc`      | MDC frontmatter with `description` and `alwaysApply: true`. Plain `.md` rules are not used.                       |
| `copilot`  | `.github/copilot-instructions.md` | Repository-wide Markdown, the widely supported Copilot mechanism.                                                 |
| `windsurf` | `.windsurf/rules/ruleskit.md`     | Workspace Markdown with `trigger: always_on`. Compatibility fallback; see the current documentation change below. |

## Primary sources and constraints

- [Claude Code memory](https://code.claude.com/docs/en/memory): `CLAUDE.md` and `.claude/CLAUDE.md` are project instructions. Current releases also support `AGENTS.md`, with precedence depending on version/settings. RulesKit emits standalone `CLAUDE.md` without imports, preventing dependence on another enabled adapter. Existing `.claude` rules remain untouched.
- [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md): hierarchical discovery considers `AGENTS.override.md` before `AGENTS.md`. Combined instruction size has a configurable limit (32 KiB by default). RulesKit flags a root override in audit and limits each output to 32,000 bytes; ancestor instructions can still exhaust the agent's combined budget.
- [Gemini CLI context](https://geminicli.com/docs/cli/gemini-md/): `GEMINI.md` is the default, with hierarchical loading and configurable filenames. Custom `context.fileName` settings and global configuration are outside this adapter's scope. This does **not** claim Antigravity compatibility.
- [Cursor rules](https://cursor.com/docs/rules): project rules are `.mdc` files with activation frontmatter. The generated file is always applied; textual directory scopes in its body do not implement path-triggered activation. Legacy `.cursorrules` is detected, never generated or deleted.
- [Copilot repository instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions) and [support matrix](https://docs.github.com/en/copilot/reference/custom-instructions-support): repository-wide and path-specific instructions are separate formats; feature support differs by host. RulesKit deliberately targets the repository-wide format. Existing `.github/instructions/*.instructions.md` files remain untouched.
- [Windsurf/Cascade rules](https://docs.windsurf.com/windsurf/cascade/memories) currently redirect to [Devin Desktop memory](https://docs.devin.ai/desktop/cascade/memories). Current documentation prefers `.devin/rules/*.md`, retaining `.windsurf/rules/*.md` as a fallback and legacy `.windsurfrules`. RulesKit's named Windsurf adapter uses the fallback for compatibility with existing Windsurf installations, warns and fails audit if preferred `.devin/rules` files are detected, and imposes a conservative 12,000-byte budget (the documented limit is 12,000 characters). A dedicated Devin adapter is deferred.

All outputs contain the same reviewed rules. Enabling all six may introduce repeated context in agents that read other agents' files; select only the adapters needed. Local/global agent settings, instruction imports, ignored files, nested overrides and agent versions can affect actual discovery. RulesKit cannot guarantee that an agent follows instructions.

## Ownership and frontmatter

HTML comment markers identify the generated body; they do not change instruction semantics. For Cursor/Windsurf, the adapter additionally validates the exact required frontmatter. If a file already exists, `--merge` appends a body only when this frontmatter is already compatible. RulesKit will not rewrite a different activation mode. Move such a file to a distinct rule filename, or merge its content into `userRules` manually.

To update formats, change the relevant adapter, fixtures/tests and this document together. Preserve output ownership and explicitly document any migration of paths.
