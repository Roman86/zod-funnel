import { Bench } from 'tinybench';
import * as z from 'zod';

import { funnel } from '../src/index.ts';

// The same three-shape Person schema, built three ways:
// - with funnel;
// - hand-written as the .or() chain a user would naturally write
//   (nested unions: union(union(Person, A), B));
// - hand-written as one flat z.union([Person, A, B]) — structurally
//   identical to what funnel builds, the fairness control.
const Person = z.object({
  first_name: z.string(),
  last_name: z.string(),
});

const splitName = (name: string) => ({
  first_name: name.split(' ')[0],
  last_name: name.split(' ')[1],
});

const PersonFunnel = funnel(Person)
  .from(z.object({ full_name: z.string() }), ({ full_name }) =>
    splitName(full_name),
  )
  .from(z.object({ name: z.string() }), ({ name }) => splitName(name));

const AltFull = z
  .object({ full_name: z.string() })
  .transform(({ full_name }) => splitName(full_name))
  .pipe(Person);
const AltName = z
  .object({ name: z.string() })
  .transform(({ name }) => splitName(name))
  .pipe(Person);

const PersonOrChain = Person.or(AltFull).or(AltName);
const PersonFlatUnion = z.union([Person, AltFull, AltName]);

const canonical = { first_name: 'John', last_name: 'Doe' };
const alternate = { name: 'John Doe' };
const mismatch = { nonsense: true };

const bench = new Bench({ name: 'zod-funnel vs hand-written zod', time: 250 });

bench
  .add('plain zod (canonical only, baseline)', () => {
    Person.parse(canonical);
  })
  .add('funnel: canonical', () => {
    PersonFunnel.parse(canonical);
  })
  .add('or-chain: canonical', () => {
    PersonOrChain.parse(canonical);
  })
  .add('flat union: canonical', () => {
    PersonFlatUnion.parse(canonical);
  })
  .add('funnel: last alternate', () => {
    PersonFunnel.parse(alternate);
  })
  .add('or-chain: last alternate', () => {
    PersonOrChain.parse(alternate);
  })
  .add('flat union: last alternate', () => {
    PersonFlatUnion.parse(alternate);
  })
  .add('funnel: mismatch (safeParse)', () => {
    PersonFunnel.safeParse(mismatch);
  })
  .add('or-chain: mismatch (safeParse)', () => {
    PersonOrChain.safeParse(mismatch);
  })
  .add('flat union: mismatch (safeParse)', () => {
    PersonFlatUnion.safeParse(mismatch);
  });

await bench.run();

console.table(bench.table());

// The check: funnel must stay within TOLERANCE of both hand-written
// variants on every scenario.
const TOLERANCE = 0.75;

const opsPerSec = (name: string): number => {
  const result = bench.getTask(name)?.result;
  if (!result || result.state !== 'completed') {
    throw new Error(`no result for task "${name}"`);
  }
  return result.throughput.mean;
};

const scenarios = [
  'canonical',
  'last alternate',
  'mismatch (safeParse)',
] as const;

let failed = false;
const compare = (rivalPrefix: string) => {
  for (const scenario of scenarios) {
    const ratio =
      opsPerSec(`funnel: ${scenario}`) / opsPerSec(`${rivalPrefix}: ${scenario}`);
    const verdict = ratio >= TOLERANCE ? 'ok  ' : 'FAIL';
    const label = ratio >= 1 ? 'funnel is faster' : 'funnel is slower';
    console.log(
      `${verdict} ${scenario}: ${(ratio * 100).toFixed(1)}% (${label})`,
    );
    if (ratio < TOLERANCE) failed = true;
  }
};

console.log(
  '\nThroughput of the funnel-built schema relative to hand-written zod',
);
console.log('(ops/sec; 100% = same speed, higher = funnel is faster).\n');

console.log('vs the .or() chain (nested unions):');
compare('or-chain');

console.log('\nvs a flat z.union (identical structure, fairness control):');
compare('flat union');

if (failed) {
  console.error(
    `\nPerformance check failed: funnel is more than ${Math.round(
      (1 - TOLERANCE) * 100,
    )}% slower than a hand-written zod schema.`,
  );
  process.exit(1);
}
console.log('\nPerformance check passed.');
