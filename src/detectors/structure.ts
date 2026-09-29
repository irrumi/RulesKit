import path from 'node:path';
import type { Detector } from './types.js';

export const structureDetector: Detector = {
  id: 'structure',
  async detect(ctx) {
    const languageExt: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.py': 'Python',
      '.rs': 'Rust',
      '.go': 'Go',
      '.java': 'Java',
      '.kt': 'Kotlin',
      '.c': 'C',
      '.cpp': 'C++',
      '.h': 'C/C++',
    };
    const languages = new Set<string>();
    for (const file of ctx.files) {
      const base = path.posix.basename(file);
      const language = languageExt[path.posix.extname(file)];
      if (language && !languages.has(language)) {
        ctx.add('language', language, file);
        languages.add(language);
      }
      const rules: [RegExp, Parameters<typeof ctx.add>[0], string][] = [
        [/^Dockerfile(?:\..+)?$/, 'infrastructure', 'Docker'],
        [
          /^(?:docker-)?compose(?:\.[\w-]+)?\.ya?ml$/,
          'infrastructure',
          'Docker Compose',
        ],
        [/^(?:eslint\.config\..+|\.eslintrc(?:\..+)?)$/, 'lint', 'ESLint'],
        [
          /^(?:\.prettierrc(?:\..+)?|prettier\.config\..+)$/,
          'format',
          'Prettier',
        ],
        [/^pytest\.ini$/, 'testing', 'pytest'],
        [/^vitest\.config\..+$/, 'testing', 'Vitest'],
        [/^jest\.config\..+$/, 'testing', 'Jest'],
        [/^\.?rustfmt\.toml$/, 'format', 'rustfmt'],
        [/^go\.mod$/, 'packageManager', 'Go modules'],
        [/^pom\.xml$/, 'build', 'Maven'],
        [/^build\.gradle(?:\.kts)?$/, 'build', 'Gradle'],
        [/^platformio\.ini$/, 'build', 'PlatformIO'],
        [/^CMakeLists\.txt$/, 'build', 'CMake'],
        [
          /^commitlint.config\..+$|^\.commitlintrc(?:\..+)?$/,
          'git',
          'commitlint configuration',
        ],
      ];
      for (const [pattern, category, value] of rules)
        if (pattern.test(base)) {
          await ctx.read(file);
          ctx.add(category, value, file);
        }
      if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file)) {
        await ctx.read(file);
        ctx.add('infrastructure', 'GitHub Actions', file);
      }
      if (/^(?:.*\/)?src\/(?:lib\/)?api\.(?:ts|js)$/.test(file))
        ctx.add(
          'api',
          'Possible shared API client; inspect before adding another client',
          file,
          'inference',
        );
    }
    const dirs = new Set(
      ctx.files.flatMap((file) =>
        file
          .split('/')
          .slice(0, -1)
          .map((_, i, parts) => parts.slice(0, i + 1).join('/')),
      ),
    );
    for (const dir of [...dirs].sort())
      if (
        /(?:^|\/)(components|tests|test|migrations|routes|models|backend|frontend)$/.test(
          dir,
        )
      ) {
        const evidence = ctx.files.find((f) => f.startsWith(`${dir}/`))!;
        ctx.add('directory', dir, evidence);
      }
  },
};
