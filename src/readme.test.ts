import * as fs from 'node:fs';
import * as path from 'node:path';

import * as ts from 'typescript';
import * as z from 'zod';

import { funnel } from './index';

// Every ```ts block in the README runs as a test. Blocks preceded by an
// <!-- doctest: skip --> comment are illustrative only and are not run.
// A trailing `; // → <literal>` comment becomes a toEqual assertion.

const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

const BLOCK = /(<!--\s*doctest:\s*skip\s*-->\s*)?```ts\n([\s\S]*?)```/g;

const blocks: Array<{ name: string; code: string }> = [];
for (const m of readme.matchAll(BLOCK)) {
  if (m[1]) continue;
  const headings = [...readme.slice(0, m.index).matchAll(/^#{1,6}\s+(.+)$/gm)];
  const heading = headings.at(-1)?.[1] ?? 'README';
  blocks.push({ name: `${heading} #${blocks.length + 1}`, code: m[2] });
}

// z and funnel are provided by the harness, so imports are dropped.
const toRunnable = (code: string) =>
  code
    .split('\n')
    .filter((line) => !line.startsWith('import '))
    .map((line) => {
      const doctest = line.match(/^(\s*)(.+); \/\/ → (.+)$/);
      return doctest
        ? `${doctest[1]}expect(${doctest[2]}).toEqual(${doctest[3]});`
        : line;
    })
    .join('\n');

describe('README examples', () => {
  test('extraction finds runnable blocks', () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  for (const { name, code } of blocks) {
    test(name, () => {
      const js = ts.transpileModule(toRunnable(code), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
      new Function('z', 'funnel', 'expect', 'exports', js)(z, funnel, expect, {});
    });
  }
});
