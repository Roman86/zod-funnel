# zod-funnel

[![NPM Downloads](https://img.shields.io/npm/dm/zod-funnel)](https://www.npmjs.com/package/zod-funnel)
[![npm version](https://badge.fury.io/js/zod-funnel.svg)](https://badge.fury.io/js/zod-funnel)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/romanjs)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-ea4aaa?logo=github-sponsors&logoColor=white)](https://github.com/sponsors/Roman86)

Accept many input shapes, parse to one canonical [Zod](https://zod.dev) schema.

## What

`zod-funnel` lets you declare a single canonical schema and funnel any
number of alternate shapes into it — each with a small mapping function —
while keeping full type safety. The result is a regular Zod schema.

```
{ first_name, last_name }  ──┐
{ full_name }  ── map ───────┼──▶  Person
{ name }  ────── map ────────┘
```

## Why

APIs evolve: a field gets renamed, an old client still sends the legacy
payload, a third party uses its own naming. Instead of scattering ad-hoc
normalizers around the codebase, you state the canonical shape once and
keep each alternate as a small, type-checked mapping right next to it.

## Install

```sh
npm install zod-funnel zod
```

Requires `zod@^4` as a peer dependency.

## Usage

```ts
import * as z from 'zod';
import { funnel } from 'zod-funnel';

const Person = z.object({
  first_name: z.string(),
  last_name: z.string(),
});

const PersonFlex = funnel(Person)
  .from(z.object({ full_name: z.string() }), ({ full_name }) => ({
    first_name: full_name.split(' ')[0],
    last_name: full_name.split(' ')[1],
  }))
  .from(z.object({ name: z.string() }), ({ name }) => ({
    first_name: name.split(' ')[0],
    last_name: name.split(' ')[1],
  }));

PersonFlex.parse({ first_name: 'John', last_name: 'Doe' }); // canonical
PersonFlex.parse({ full_name: 'John Doe' }); // → { first_name: 'John', last_name: 'Doe' }
PersonFlex.parse({ name: 'John Doe' }); // → { first_name: 'John', last_name: 'Doe' }

PersonFlex.safeParse({ nonsense: true }); // { success: false, error: ZodError }
```

`PersonFlex` is a real Zod schema — `parse`, `safeParse`, `.array()`,
`.optional()` and the rest of the Zod API all work as usual.

Alternate shapes don't have to be objects — any Zod schema works as a
source, e.g. a plain string:

```ts
const User = funnel(z.object({ name: z.string(), age: z.number().nullable() }))
  .from(z.string(), (v) => ({
    name: v.split(' ')[0],
    age: null,
  }));

User.parse('John Doe'); // → { name: 'John', age: null }
User.parse({ name: 'John', age: 30 }); // canonical
```

The same trick covers a common API evolution: an endpoint used to return a
bare array, then grew extra fields and now wraps it in an object:

```ts
const Results = z.object({ items: z.array(z.string()), total: z.number() });

const ResultsFlex = funnel(Results).from(z.array(z.string()), (items) => ({
  items,
  total: items.length,
}));

ResultsFlex.parse(['a', 'b']); // → { items: ['a', 'b'], total: 2 }
ResultsFlex.parse({ items: ['a', 'b'], total: 2 }); // canonical
```

### Adapters as an array

`.from()` also accepts an array of adapters — handy when the set of
adapters is built dynamically and chaining is not an option. Each adapter
is a `[source, map]` pair:

```ts
const Point = z.object({ x: z.number(), y: z.number() });

const PointFlex = funnel(Point).from([
  [z.tuple([z.number(), z.number()]), ([x, y]) => ({ x, y })],
  [z.number(), (x) => ({ x, y: 0 })],
]);

PointFlex.parse([1, 2]); // → { x: 1, y: 2 }
PointFlex.parse(7); // → { x: 7, y: 0 }
```

Both forms return the same kind of schema, so they mix freely on one
chain. For arrays built outside the call, the `FunnelAdapter` type is
exported: `FunnelAdapter<typeof Point>[]`.

## Semantics

- Shapes are tried in order: the canonical schema first, then each alternate
  in declaration order (array order within an adapter array). The first
  match wins.
- Every mapper's output is **re-validated** against the target schema, so a
  mapping that produces invalid data (e.g. `'Madonna'.split(' ')[1]` being
  `undefined`) fails the parse instead of leaking a broken value.
- `funnel(target)` alone is **not** a schema — it only has `.from()`. An
  unfinished funnel has no `parse`/`safeParse`, so using it as a schema
  simply doesn't type-check: no special errors, the type system rules it
  out on its own.
- Every `.from()` returns a new schema; previously built schemas are never
  mutated.

## Compared to plain Zod

`zod-funnel` is deliberately thin sugar over Zod itself. The example above is
equivalent to:

<!-- doctest: skip -->
```ts
const PersonFlex = Person.or(
  z.object({ full_name: z.string() }).transform(fullNameToPerson).pipe(Person),
).or(z.object({ name: z.string() }).transform(nameToPerson).pipe(Person));
```

What the sugar buys you: the target schema is stated once instead of being
repeated in every `.pipe()`, the `transform` + `pipe` re-validation pattern
is impossible to forget, and each mapper's return type is checked against the
canonical schema's input.

## Limitations

- Derived schemas (`.array()`, `.optional()`, …) are ordinary Zod schemas
  without `.from()` — finish the `.from()` chain first, derive after.
- On failure the error is a regular `ZodError` from the underlying union,
  listing the issues of every attempted shape.

## License

MIT
