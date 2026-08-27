import { Bench } from 'tinybench';
import * as z from 'zod';

import { funnel } from '../src/index.ts';

// The same three-shape Person schema, built with funnel and by hand.
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

const PersonNative = Person.or(
  z
    .object({ full_name: z.string() })
    .transform(({ full_name }) => splitName(full_name))
    .pipe(Person),
).or(
  z
    .object({ name: z.string() })
    .transform(({ name }) => splitName(name))
    .pipe(Person),
);

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
  .add('native: canonical', () => {
    PersonNative.parse(canonical);
  })
  .add('funnel: last alternate', () => {
    PersonFunnel.parse(alternate);
  })
  .add('native: last alternate', () => {
    PersonNative.parse(alternate);
  })
  .add('funnel: mismatch (safeParse)', () => {
    PersonFunnel.safeParse(mismatch);
  })
  .add('native: mismatch (safeParse)', () => {
    PersonNative.safeParse(mismatch);
  });

await bench.run();

console.table(bench.table());

// The check: funnel must stay within TOLERANCE of the equivalent
// hand-written union on every scenario.
const TOLERANCE = 0.75;

const opsPerSec = (name: string): number => {
  const result = bench.getTask(name)?.result;
  if (!result || result.state !== 'completed') {
    throw new Error(`no result for task "${name}"`);
  }
  return result.throughput.mean;
};

const pairs = [
  ['funnel: canonical', 'native: canonical'],
  ['funnel: last alternate', 'native: last alternate'],
  ['funnel: mismatch (safeParse)', 'native: mismatch (safeParse)'],
] as const;

let failed = false;
for (const [funnelTask, nativeTask] of pairs) {
  const ratio = opsPerSec(funnelTask) / opsPerSec(nativeTask);
  const verdict = ratio >= TOLERANCE ? 'ok  ' : 'FAIL';
  console.log(
    `${verdict} ${funnelTask}: ${(ratio * 100).toFixed(1)}% of native throughput`,
  );
  if (ratio < TOLERANCE) failed = true;
}

if (failed) {
  console.error(
    `\nPerformance check failed: funnel is more than ${Math.round(
      (1 - TOLERANCE) * 100,
    )}% slower than the equivalent hand-written zod schema.`,
  );
  process.exit(1);
}
console.log('\nPerformance check passed.');
