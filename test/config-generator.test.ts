import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configSchema } from '../src/model.js';
import { scan } from '../src/scanner.js';
import { parseConfig, serializeConfig } from '../src/config.js';
import { generateRules, renderRules } from '../src/generator.js';
import { adapters, START, END, extractBlock } from '../src/adapters.js';
import { repository, put } from './helpers.js';

test('canonical YAML round-trips with defaults', async (t) => {
  const config = configSchema.parse({
    version: 1,
    agents: ['codex'],
    detected: await scan(await repository(t, 'react')),
  });
  assert.deepEqual(parseConfig(serializeConfig(config)), config);
  assert.deepEqual(config.userRules, []);
});
for (const source of [
  'version: [',
  'version: 1\nversion: 2',
  'version: 99',
  'version: 1\nagents: [unknown]',
  '!!js/function function() {}',
])
  test(`reject malformed config ${source.slice(0, 25)}`, () =>
    assert.throws(() => parseConfig(source)));
test('reject invalid paths, duplicate IDs, unknown properties and marker injection', async (t) => {
  const config = configSchema.parse({
    version: 1,
    agents: ['codex'],
    detected: await scan(await repository(t)),
  });
  for (const scope of ['../escape', '/absolute', 'C:/windows', 'a\\b'])
    assert.throws(() =>
      configSchema.parse({
        ...config,
        userRules: [{ id: 'x', text: 'rule', scope }],
      }),
    );
  assert.throws(() => configSchema.parse({ ...config, extra: true }));
  assert.throws(() =>
    configSchema.parse({ ...config, agents: ['codex', 'codex'] }),
  );
  assert.throws(() =>
    configSchema.parse({ ...config, userRules: [{ id: 'x', text: START }] }),
  );
  assert.throws(() =>
    configSchema.parse({
      ...config,
      userRules: [
        { id: 'x', text: 'a' },
        { id: 'x', text: 'b' },
      ],
    }),
  );
});
test('generation separates origins, honors disabled rules, does not infer strict mode', async (t) => {
  const root = await repository(t, 'react');
  const config = configSchema.parse({
    version: 1,
    agents: ['codex'],
    detected: await scan(root),
    userRules: [
      {
        id: 'local',
        text: 'Ask before changing the wire protocol.',
        scope: 'src',
      },
    ],
  });
  const text = renderRules(config);
  assert(text.includes('Repository evidence'));
  assert(text.includes('Inferred conventions'));
  assert(text.includes('User-defined rules'));
  assert(text.includes('npm run test'));
  const rule = generateRules(config).find((r) =>
    r.text.includes('strict mode'),
  )!;
  config.disabledRules.push(rule.id);
  assert(!renderRules(config).includes('Keep TypeScript strict mode'));
  await put(root, 'tsconfig.json', '{"compilerOptions":{"strict":false}}');
  config.detected = await scan(root);
  assert(
    !generateRules(config).some((r) =>
      r.text.includes('Keep TypeScript strict mode'),
    ),
  );
});
test('conflicting managers do not produce confident executable commands', async (t) => {
  const root = await repository(t, 'react');
  await put(root, 'yarn.lock', '');
  const config = configSchema.parse({
    version: 1,
    agents: ['codex'],
    detected: await scan(root),
  });
  assert(!renderRules(config).includes('npm run test'));
  assert(renderRules(config).includes('confirm the package manager'));
});
test('all adapters produce deterministic supported headers and own blocks', async (t) => {
  const config = configSchema.parse({
    version: 1,
    agents: ['codex'],
    detected: await scan(await repository(t, 'react')),
  });
  for (const adapter of Object.values(adapters)) {
    const block = adapter.generate(config),
      content = adapter.preamble + block + '\n';
    adapter.validate(content);
    assert.equal(adapter.generate(config), block);
    assert.equal(extractBlock(content)?.block, block);
    assert.throws(
      () => adapter.validate(content + 'x'.repeat(33000)),
      /budget/,
    );
  }
  assert(adapters.cursor.preamble.includes('alwaysApply: true'));
  assert(adapters.windsurf.preamble.includes('trigger: always_on'));
  assert.equal(adapters.copilot.path, '.github/copilot-instructions.md');
});
for (const text of [
  START,
  END,
  `${END}\n${START}`,
  `${START}\n${START}\n${END}`,
  `prefix${START}\n${END}`,
])
  test(`reject corrupt ownership markers ${text.length}`, () =>
    assert.throws(() => extractBlock(text)));
