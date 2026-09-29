import { parseDocument, stringify } from 'yaml';
import { configSchema, stateSchema, type Config, type State } from './model.js';
import { readOptional } from './core/fs.js';

export const CONFIG = '.ruleskit/config.yaml';
export const STATE = '.ruleskit/state.json';
export function parseConfig(source: string): Config {
  const doc = parseDocument(source, { uniqueKeys: true });
  if (doc.errors.length)
    throw new Error(
      `Invalid ${CONFIG}: ${doc.errors.map((e) => e.message).join('; ')}`,
    );
  const result = configSchema.safeParse(doc.toJS({ maxAliasCount: 20 }));
  if (!result.success)
    throw new Error(
      `Invalid ${CONFIG}: ${result.error.issues.map((e) => `${e.path.join('.') || 'config'}: ${e.message}`).join('; ')}`,
    );
  return result.data;
}
export function serializeConfig(config: Config): string {
  return (
    '# RulesKit v1. Review detected evidence; customize userRules and disabledRules.\n' +
    stringify(configSchema.parse(config), { lineWidth: 0 })
  );
}
export async function loadConfig(root: string): Promise<Config> {
  const text = await readOptional(root, CONFIG);
  if (text === null)
    throw new Error('RulesKit is not initialized. Run ruleskit init first.');
  return parseConfig(text);
}
export async function loadState(root: string): Promise<State | null> {
  const text = await readOptional(root, STATE);
  if (text === null) return null;
  try {
    return stateSchema.parse(JSON.parse(text));
  } catch {
    throw new Error(
      `Invalid ${STATE}; restore it from version control before syncing.`,
    );
  }
}
