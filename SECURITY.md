# Security

The latest `0.1.x` source revision is the supported pre-1.0 line. This project is new; it has not undergone an independent security audit.

RulesKit reads local repository metadata and writes selected instruction files plus `.ruleskit` configuration/state. It does not execute repository code, run scripts, collect telemetry or use external AI services. Dependency installation is performed by npm and is separate from CLI operations.

Please report path traversal, unintended overwrites, unsafe parsing and dependency vulnerabilities. If GitHub private vulnerability reporting is available for this repository, use it. Otherwise open an issue asking maintainers for a private reporting channel, without publishing secrets or exploit details. Include the affected version, OS, a minimal synthetic reproduction and the expected safety boundary. Never include real credentials or private repository content.

The supported filesystem model is a stable local working tree. Link/junction checks, fixed output paths, preflight checks and optimistic concurrency reduce accidental damage; they are not an OS sandbox or protection from a malicious process racing filesystem operations. File replacement is atomic per file, not across the entire output set. Review generated instructions before using them: repository evidence and canonical user rules are trusted project content, not a prompt-injection filter.
