import { z } from 'zod';

export const agentIds = [
  'claude',
  'codex',
  'gemini',
  'cursor',
  'copilot',
  'windsurf',
] as const;
export type AgentId = (typeof agentIds)[number];
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const relativePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (p) =>
      !/[\\:\x00-\x1f]/.test(p) &&
      !p.startsWith('/') &&
      p.split('/').every((s) => s !== '..' && s !== ''),
    'Expected a relative POSIX path inside the repository',
  );
const textSchema = z
  .string()
  .min(1)
  .max(2000)
  .refine(
    (s) =>
      !s.includes('<!-- ruleskit:') && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s),
    'Invalid control characters or reserved ownership marker',
  );
export const factSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum([
      'language',
      'framework',
      'packageManager',
      'testing',
      'lint',
      'format',
      'typecheck',
      'build',
      'infrastructure',
      'architecture',
      'database',
      'api',
      'directory',
      'git',
      'command',
    ]),
    value: textSchema,
    scope: relativePathSchema,
    evidence: z.array(relativePathSchema).min(1),
    confidence: z.enum(['fact', 'inference']),
  })
  .strict();
export type Fact = z.infer<typeof factSchema>;
export const snapshotSchema = z
  .object({
    facts: z.array(factSchema),
    inputs: z.record(relativePathSchema, hashSchema),
    structureHash: hashSchema,
    warnings: z.array(z.string()),
    existingInstructions: z.array(relativePathSchema),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export const configSchema = z
  .object({
    version: z.literal(1),
    agents: z
      .array(z.enum(agentIds))
      .min(1)
      .refine((a) => new Set(a).size === a.length, 'Duplicate agent'),
    detected: snapshotSchema,
    disabledRules: z.array(z.string()).default([]),
    userRules: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9._-]+$/),
            text: textSchema,
            scope: relativePathSchema.default('.'),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const [name, ids] of [
      ['facts', c.detected.facts.map((f) => f.id)],
      ['userRules', c.userRules.map((r) => r.id)],
    ] as const) {
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: 'custom', message: `Duplicate IDs in ${name}` });
    }
  });
export type Config = z.infer<typeof configSchema>;
export const stateSchema = z
  .object({
    version: z.literal(1),
    configHash: hashSchema,
    outputs: z.record(relativePathSchema, hashSchema),
  })
  .strict();
export type State = z.infer<typeof stateSchema>;
