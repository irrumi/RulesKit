# Maintenance backlog

## RK-02 — independent source-language evidence

- Problem: source-extension detection deduplicated languages repository-wide, hiding evidence in sibling workspaces.
- Evidence: the mixed-workspace regression in `test/scanner.test.ts` loses `language:apps/web/src:TypeScript` when an earlier sibling also contains TypeScript.
- Dependency: RK-01 installed-package baseline.
- Acceptance: each source directory retains its language fact, evidence and stable ID; adding a sibling does not change existing facts; repeated scans are deterministic.
- Risk: low; additional detected language facts after explicit refresh. No schema, writer, dependency or native adapter-scope changes.
- Status: implemented on `maint/RK-02-workspace-isolation`; pending review and publication checks.
- Next: separately design explicit workspace roots and richer provenance. Native scoped outputs remain RK-03 work.
