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
  firstName: z.string(),
  lastName: z.string(),
});

const splitName = (name: string) => ({
  firstName: name.split(' ')[0],
  lastName: name.split(' ')[1],
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

const canonical = { firstName: 'John', lastName: 'Doe' };
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
const ratioCell = (ratio: number): string => {
  if (ratio < TOLERANCE) failed = true;
  return `${(ratio * 100).toFixed(1)}%${ratio < TOLERANCE ? ' FAIL' : ''}`;
};

console.log('\nfunnel throughput by scenario (ops/s, higher is better).');
console.log(
  'The vs columns relate funnel to the equivalent hand-written schema:',
);
console.log('over 100% = funnel is faster, under = slower, 100% = the same;');
console.log(`below ${TOLERANCE * 100}% the check fails.`);
console.log('- vs or-chain: the .or() chain a user would write (nested unions)');
console.log('- vs flat union: flat z.union, structurally identical to funnel');

console.table(
  scenarios.map((scenario) => {
    const funnelOps = opsPerSec(`funnel: ${scenario}`);
    return {
      Scenario: scenario,
      'funnel (ops/s)': Math.round(funnelOps).toLocaleString('en-US'),
      'vs or-chain': ratioCell(funnelOps / opsPerSec(`or-chain: ${scenario}`)),
      'vs flat union': ratioCell(
        funnelOps / opsPerSec(`flat union: ${scenario}`),
      ),
    };
  }),
);

const unionCost =
  opsPerSec('funnel: canonical') /
  opsPerSec('plain zod (canonical only, baseline)');
console.log(
  `\nFor context: with two alternates attached, canonical parses run at ` +
    `${(unionCost * 100).toFixed(1)}% of a bare Person.parse — the cost of ` +
    `having a union at all, identical for funnel and hand-written zod.`,
);

if (failed) {
  console.error(
    `\nPerformance check failed: funnel is more than ${Math.round(
      (1 - TOLERANCE) * 100,
    )}% slower than a hand-written zod schema.`,
  );
  process.exit(1);
}
console.log('\nPerformance check passed.');
