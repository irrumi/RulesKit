import type { Config, Fact } from './model.js';

export interface Rule {
  id: string;
  text: string;
  scope: string;
  origin: 'fact' | 'inference' | 'user';
  evidence: string[];
}
export type RuleGenerator = (config: Config) => Rule[];
function describe(fact: Fact, config: Config): string | null {
  if (fact.category === 'command') {
    const managers = [
      ...new Set(
        config.detected.facts
          .filter(
            (f) =>
              f.category === 'packageManager' &&
              f.scope === fact.scope &&
              ['npm', 'pnpm', 'yarn', 'bun'].includes(f.value),
          )
          .map((f) => f.value),
      ),
    ];
    return managers.length === 1
      ? `Use \`${managers[0]} run ${fact.value}\` for the existing ${fact.value} script (review its definition before executing).`
      : `An existing \`${fact.value}\` package script is available; confirm the package manager before running it.`;
  }
  if (fact.category === 'typecheck' && fact.value === 'TypeScript strict mode')
    return 'Keep TypeScript strict mode enabled in the cited configuration.';
  if (fact.category === 'directory')
    return `Existing directory: \`${fact.value}\`. Consult its local conventions when changing this area.`;
  if (fact.category === 'api' && fact.confidence === 'inference')
    return `${fact.value}.`;
  if (['testing', 'lint', 'format', 'typecheck'].includes(fact.category))
    return `Use the existing ${fact.value} ${fact.category} tooling and its repository configuration.`;
  if (fact.category === 'language') return null;
  return `${fact.category}: ${fact.value} is declared by the cited repository evidence.`;
}
export const evidenceRules: RuleGenerator = (config) =>
  config.detected.facts.flatMap((fact) => {
    const text = describe(fact, config);
    return text
      ? [
          {
            id: fact.id,
            text,
            scope: fact.scope,
            origin: fact.confidence,
            evidence: fact.evidence,
          },
        ]
      : [];
  });
export function generateRules(
  config: Config,
  generators: RuleGenerator[] = [evidenceRules],
): Rule[] {
  return [
    ...generators
      .flatMap((g) => g(config))
      .filter((r) => !config.disabledRules.includes(r.id)),
    ...config.userRules.map((r) => ({
      ...r,
      origin: 'user' as const,
      evidence: [],
    })),
  ];
}
function inline(text: string): string {
  return text.replaceAll('\r', '').replaceAll('\n', ' ');
}
export function renderRules(config: Config): string {
  const rules = generateRules(config);
  const lines = [
    '# Project instructions',
    '',
    'Managed by RulesKit. Edit `.ruleskit/config.yaml`, then run `ruleskit sync`.',
    'Evidence records declarations and paths, not proof that commands pass. Directory scopes below are relative to the repository root.',
    '',
  ];
  for (const [origin, label] of [
    ['fact', 'Repository evidence'],
    ['inference', 'Inferred conventions — verify before applying'],
    ['user', 'User-defined rules'],
  ] as const) {
    const selected = rules.filter((r) => r.origin === origin);
    if (!selected.length) continue;
    lines.push(`## ${label}`, '');
    for (const rule of selected)
      lines.push(
        `- [${inline(rule.scope)}] ${inline(rule.text)}${rule.evidence.length ? ` Evidence: ${rule.evidence.map((e) => `\`${inline(e)}\``).join(', ')}.` : ''}`,
      );
    lines.push('');
  }
  if (!rules.length)
    lines.push(
      'No actionable conventions were detected. Add reviewed project rules to `userRules`.',
      '',
    );
  return lines.join('\n');
}
