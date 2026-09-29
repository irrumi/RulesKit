import type { AgentId, Config } from './model.js';
import { renderRules } from './generator.js';

export const START = '<!-- ruleskit:begin -->';
export const END = '<!-- ruleskit:end -->';
export interface AgentAdapter {
  id: AgentId;
  path: string;
  preamble: string;
  maxBytes: number;
  generate(config: Config): string;
  validate(content: string): void;
}
function adapter(
  id: AgentId,
  path: string,
  preamble = '',
  maxBytes = 32000,
): AgentAdapter {
  return {
    id,
    path,
    preamble,
    maxBytes,
    generate: (config) => `${START}\n${renderRules(config)}${END}`,
    validate(content) {
      if (preamble && !content.startsWith(preamble))
        throw new Error(
          `${path}: frontmatter differs from the supported adapter format. Preserve it separately and restore the generated header.`,
        );
      if (Buffer.byteLength(content) > maxBytes)
        throw new Error(
          `${path}: output exceeds the ${maxBytes}-byte adapter budget; reduce rules or select fewer detectors.`,
        );
    },
  };
}
export const adapters: Record<AgentId, AgentAdapter> = {
  claude: adapter('claude', 'CLAUDE.md'),
  codex: adapter('codex', 'AGENTS.md'),
  gemini: adapter('gemini', 'GEMINI.md'),
  cursor: adapter(
    'cursor',
    '.cursor/rules/ruleskit.mdc',
    '---\ndescription: Project conventions maintained by RulesKit\nalwaysApply: true\n---\n\n',
  ),
  copilot: adapter('copilot', '.github/copilot-instructions.md'),
  windsurf: adapter(
    'windsurf',
    '.windsurf/rules/ruleskit.md',
    '---\ntrigger: always_on\n---\n\n',
    12000,
  ),
};
export function extractBlock(
  text: string,
): { block: string; start: number; end: number } | null {
  const starts = text.split(START).length - 1,
    ends = text.split(END).length - 1;
  if (!starts && !ends) return null;
  if (starts !== 1 || ends !== 1 || text.indexOf(START) > text.indexOf(END))
    throw new Error(
      'Malformed or duplicate RulesKit ownership markers; restore the file before syncing.',
    );
  const start = text.indexOf(START),
    end = text.indexOf(END) + END.length;
  if (
    (start > 0 && text[start - 1] !== '\n') ||
    (end < text.length && !['\r', '\n'].includes(text[end]!))
  )
    throw new Error('RulesKit markers must occupy their own lines.');
  return { block: text.slice(start, end), start, end };
}
