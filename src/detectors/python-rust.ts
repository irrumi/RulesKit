import path from 'node:path';
import { parse } from 'smol-toml';
import type { Detector } from './types.js';

const pythonDeps: Record<
  string,
  [
    (
      | 'framework'
      | 'testing'
      | 'lint'
      | 'format'
      | 'typecheck'
      | 'database'
      | 'api'
    ),
    string,
  ]
> = {
  django: ['framework', 'Django'],
  djangorestframework: ['api', 'Django REST Framework'],
  fastapi: ['framework', 'FastAPI'],
  flask: ['framework', 'Flask'],
  pytest: ['testing', 'pytest'],
  ruff: ['lint', 'Ruff'],
  black: ['format', 'Black'],
  mypy: ['typecheck', 'mypy'],
  sqlalchemy: ['database', 'SQLAlchemy'],
};
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function dependencyNames(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .filter((x): x is string => typeof x === 'string')
      .map(
        (x) =>
          x
            .match(/^[\w.-]+/)?.[0]
            ?.toLowerCase()
            .replaceAll('_', '-') ?? '',
      );
  return Object.keys(record(value)).map((x) =>
    x.toLowerCase().replaceAll('_', '-'),
  );
}
export const pythonRustDetector: Detector = {
  id: 'python-rust',
  async detect(ctx) {
    for (const file of ctx.files) {
      const base = path.posix.basename(file);
      let names: string[] = [];
      if (base === 'pyproject.toml' || base === 'Cargo.toml') {
        const source = await ctx.read(file);
        let data;
        try {
          data = parse(source);
        } catch {
          ctx.warn(`Cannot parse ${file}; TOML detection skipped.`);
          continue;
        }
        if (base === 'pyproject.toml') {
          ctx.add('language', 'Python', file);
          const project = record(data.project),
            tool = record(data.tool),
            poetry = record(tool.poetry);
          names = [
            ...dependencyNames(project.dependencies),
            ...Object.values(record(project['optional-dependencies'])).flatMap(
              dependencyNames,
            ),
            ...Object.values(record(data['dependency-groups'])).flatMap(
              dependencyNames,
            ),
            ...dependencyNames(poetry.dependencies),
            ...Object.values(record(poetry.group)).flatMap((g) =>
              dependencyNames(record(g).dependencies),
            ),
          ];
          for (const name of ['pytest', 'ruff', 'black', 'mypy'])
            if (tool[name]) names.push(name);
          if (tool.poetry) ctx.add('packageManager', 'Poetry', file);
          if (tool.uv) ctx.add('packageManager', 'uv', file);
        } else {
          ctx.add('language', 'Rust', file);
          ctx.add('packageManager', 'Cargo', file);
          if (data.package) {
            ctx.add('build', 'Cargo', file);
            ctx.add('testing', 'cargo test', file);
          }
          if (data.workspace) ctx.add('architecture', 'Cargo workspace', file);
          const deps = {
            ...record(data.dependencies),
            ...record(data['dev-dependencies']),
            ...record(record(data.workspace).dependencies),
          };
          for (const name of ['axum', 'actix-web', 'tokio'])
            if (deps[name]) ctx.add('framework', name, file);
          for (const name of ['sqlx', 'diesel'])
            if (deps[name]) ctx.add('database', name, file);
        }
      }
      if (/^requirements(?:[-.][\w-]+)?\.txt$/.test(base)) {
        ctx.add('language', 'Python', file);
        ctx.add('packageManager', 'pip', file);
        names = (await ctx.read(file))
          .split(/\r?\n/)
          .filter((s) => /^[a-zA-Z0-9]/.test(s.trim()))
          .map(
            (s) =>
              s
                .trim()
                .match(/^[\w.-]+/)?.[0]
                ?.toLowerCase()
                .replaceAll('_', '-') ?? '',
          );
      }
      for (const name of new Set(names)) {
        const dep = pythonDeps[name];
        if (dep) ctx.add(dep[0], dep[1], file);
      }
      const locks: Record<string, string> = {
        'uv.lock': 'uv',
        'poetry.lock': 'Poetry',
        'Cargo.lock': 'Cargo',
      };
      if (locks[base]) {
        await ctx.read(file);
        ctx.add('packageManager', locks[base], file);
      }
    }
  },
};
