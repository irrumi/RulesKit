import path from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';
import type { Detector } from './types.js';

const dependencies = {
  react: ['framework', 'React'],
  next: ['framework', 'Next.js'],
  vue: ['framework', 'Vue'],
  svelte: ['framework', 'Svelte'],
  express: ['framework', 'Express'],
  '@nestjs/core': ['framework', 'NestJS'],
  vite: ['build', 'Vite'],
  typescript: ['typecheck', 'TypeScript'],
  vitest: ['testing', 'Vitest'],
  jest: ['testing', 'Jest'],
  '@playwright/test': ['testing', 'Playwright'],
  eslint: ['lint', 'ESLint'],
  prettier: ['format', 'Prettier'],
  prisma: ['database', 'Prisma'],
  '@prisma/client': ['database', 'Prisma'],
} as const;
export const nodeDetector: Detector = {
  id: 'node',
  async detect(ctx) {
    for (const file of ctx.files) {
      const base = path.posix.basename(file);
      if (base === 'package.json') {
        try {
          const pkg = JSON.parse(await ctx.read(file));
          if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg))
            throw new Error('Expected object');
          ctx.add('language', 'JavaScript', file);
          const deps = {
            ...pkg.dependencies,
            ...pkg.devDependencies,
            ...pkg.peerDependencies,
          };
          for (const [name, [category, value]] of Object.entries(dependencies))
            if (typeof deps[name] === 'string') ctx.add(category, value, file);
          if (typeof deps.typescript === 'string')
            ctx.add('language', 'TypeScript', file);
          if (
            Array.isArray(pkg.workspaces) ||
            Array.isArray(pkg.workspaces?.packages)
          )
            ctx.add('architecture', 'npm-compatible workspaces', file);
          if (
            typeof pkg.packageManager === 'string' &&
            /^(npm|pnpm|yarn|bun)@/.test(pkg.packageManager)
          )
            ctx.add('packageManager', pkg.packageManager.split('@')[0], file);
          for (const name of [
            'test',
            'lint',
            'format:check',
            'typecheck',
            'build',
            'check',
          ]) {
            if (typeof pkg.scripts?.[name] === 'string') {
              // Record only script names, never potentially secret-bearing command bodies.
              ctx.add('command', name, file);
              if (/\bnode\s+--test\b/.test(pkg.scripts[name]))
                ctx.add('testing', 'node:test', file);
            }
          }
        } catch {
          ctx.warn(`Cannot parse ${file}; Node dependency detection skipped.`);
        }
      }
      if (/^tsconfig(?:\..+)?\.json$/.test(base)) {
        const errors: ParseError[] = [];
        const config = parse(await ctx.read(file), errors, {
          allowTrailingComma: true,
        });
        if (errors.length || !config || typeof config !== 'object')
          ctx.warn(`Cannot parse ${file}; TypeScript config skipped.`);
        else {
          ctx.add('language', 'TypeScript', file);
          if (config.compilerOptions?.strict === true)
            ctx.add('typecheck', 'TypeScript strict mode', file);
          if (config.extends)
            ctx.warn(`${file}: inherited TypeScript options are not resolved.`);
        }
      }
      const locks: Record<string, string> = {
        'package-lock.json': 'npm',
        'npm-shrinkwrap.json': 'npm',
        'pnpm-lock.yaml': 'pnpm',
        'yarn.lock': 'yarn',
        'bun.lock': 'bun',
        'bun.lockb': 'bun',
      };
      if (locks[base]) {
        await ctx.read(file);
        ctx.add('packageManager', locks[base], file);
      }
      if (
        base === 'pnpm-workspace.yaml' ||
        base === 'lerna.json' ||
        base === 'nx.json' ||
        base === 'turbo.json'
      ) {
        await ctx.read(file);
        ctx.add(
          'architecture',
          base === 'pnpm-workspace.yaml'
            ? 'pnpm workspaces'
            : base.split('.')[0]! + ' workspace tooling',
          file,
        );
      }
    }
  },
};
