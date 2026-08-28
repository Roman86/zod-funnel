import * as z from 'zod';

import { funnel, type FunnelAdapter } from './index';

const Person = z.object({
  firstName: z.string(),
  lastName: z.string(),
});

const splitName = (name: string) => ({
  firstName: name.split(' ')[0],
  lastName: name.split(' ')[1],
});

const PersonFlex = funnel(Person)
  .from(
    z.object({ first_name: z.string(), last_name: z.string() }),
    ({ first_name, last_name }) => ({
      firstName: first_name,
      lastName: last_name,
    }),
  )
  .from(z.object({ full_name: z.string() }), ({ full_name }) =>
    splitName(full_name),
  )
  .from(z.object({ name: z.string() }), ({ name }) => splitName(name));

describe('funnel', () => {
  test('parses the canonical shape', () => {
    const r = PersonFlex.safeParse({ firstName: 'John', lastName: 'Doe' });
    expect(r).toEqual({
      success: true,
      data: { firstName: 'John', lastName: 'Doe' },
    });
  });

  test('parses via the snake_case alternate (casing-only mapping)', () => {
    const r = PersonFlex.safeParse({ first_name: 'John', last_name: 'Doe' });
    expect(r).toEqual({
      success: true,
      data: { firstName: 'John', lastName: 'Doe' },
    });
  });

  test('parses via the full_name alternate', () => {
    const r = PersonFlex.safeParse({ full_name: 'John Doe' });
    expect(r).toEqual({
      success: true,
      data: { firstName: 'John', lastName: 'Doe' },
    });
  });

  test('parses via the name alternate', () => {
    const r = PersonFlex.safeParse({ name: 'John Doe' });
    expect(r).toEqual({
      success: true,
      data: { firstName: 'John', lastName: 'Doe' },
    });
  });

  test('alternate source can be a primitive string', () => {
    const User = funnel(
      z.object({ name: z.string(), age: z.number().nullable() }),
    ).from(z.string(), (v) => ({
      name: v.split(' ')[0],
      age: null,
    }));

    expect(User.safeParse('John Doe')).toEqual({
      success: true,
      data: { name: 'John', age: null },
    });
    expect(User.safeParse({ name: 'John', age: 30 })).toEqual({
      success: true,
      data: { name: 'John', age: 30 },
    });
  });

  test('fails on an unmatched shape', () => {
    const r = PersonFlex.safeParse({ nonsense: 'John Doe' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toBeInstanceOf(z.ZodError);
    }
  });

  test('re-validates mapper output against the target schema', () => {
    // 'Madonna'.split(' ')[1] === undefined → not a valid Person
    const r = PersonFlex.safeParse({ full_name: 'Madonna' });
    expect(r.success).toBe(false);
  });

  test('canonical input wins without going through mappers', () => {
    const mapper = jest.fn(({ full_name }: { full_name: string }) =>
      splitName(full_name),
    );
    const schema = funnel(Person).from(
      z.object({ full_name: z.string() }),
      mapper,
    );
    schema.parse({ firstName: 'John', lastName: 'Doe' });
    expect(mapper).not.toHaveBeenCalled();
  });

  test('is a real Zod schema: derived schemas work', () => {
    const list = PersonFlex.array();
    const r = list.safeParse([
      { full_name: 'John Doe' },
      { firstName: 'Jane', lastName: 'Roe' },
    ]);
    expect(r).toEqual({
      success: true,
      data: [
        { firstName: 'John', lastName: 'Doe' },
        { firstName: 'Jane', lastName: 'Roe' },
      ],
    });

    expect(PersonFlex.optional().safeParse(undefined).success).toBe(true);
  });

  test('funnel(target) alone is not a schema', () => {
    const builder = funnel(Person);
    expect('safeParse' in builder).toBe(false);
    // @ts-expect-error — safeParse does not exist before the first .from()
    expect(() => builder.safeParse({})).toThrow(TypeError);
  });

  test('output type is inferred as the canonical shape, not any', () => {
    const p = PersonFlex.parse({ full_name: 'John Doe' });
    type IsAny<X> = 0 extends 1 & X ? true : false;
    const outputIsNotAny: IsAny<typeof p> = false;
    const assignable: z.infer<typeof Person> = p;
    expect(outputIsNotAny).toBe(false);
    expect(assignable.firstName).toBe('John');
  });

  test('mapper return type is checked against the canonical shape', () => {
    funnel(Person).from(
      z.object({ x: z.string() }),
      // @ts-expect-error — mapper must return the canonical input shape
      ({ x }) => ({ wrong: x }),
    );
  });

  test('.from() accepts an array of adapters', () => {
    const schema = funnel(Person).from([
      [
        z.object({ full_name: z.string() }),
        ({ full_name }) => splitName(full_name),
      ],
      [z.object({ name: z.string() }), ({ name }) => splitName(name)],
    ]);
    const doe = { firstName: 'John', lastName: 'Doe' };
    expect(schema.parse(doe)).toEqual(doe);
    expect(schema.parse({ full_name: 'John Doe' })).toEqual(doe);
    expect(schema.parse({ name: 'John Doe' })).toEqual(doe);
    expect(schema.safeParse({ nonsense: true }).success).toBe(false);
  });

  test('array and pair forms of .from() mix on one chain', () => {
    const base = funnel(Person).from([
      [
        z.object({ full_name: z.string() }),
        ({ full_name }) => splitName(full_name),
      ],
    ]);
    const extended = base.from(z.object({ name: z.string() }), ({ name }) =>
      splitName(name),
    );
    expect(base.safeParse({ name: 'John Doe' }).success).toBe(false);
    expect(extended.safeParse({ name: 'John Doe' }).success).toBe(true);
  });

  test('.from([]) accepts only the canonical shape', () => {
    const schema = funnel(Person).from([]);
    expect(
      schema.safeParse({ firstName: 'John', lastName: 'Doe' }).success,
    ).toBe(true);
    expect(schema.safeParse({ full_name: 'John Doe' }).success).toBe(false);
  });

  test('a dynamically built adapter array works', () => {
    const keys = ['full_name', 'name'] as const;
    const adapters: FunnelAdapter<typeof Person>[] = keys.map((k) => [
      z.object({ [k]: z.string() }),
      (d) => splitName(d[k]),
    ]);
    const schema = funnel(Person).from(adapters);
    expect(schema.parse({ full_name: 'John Doe' })).toEqual({
      firstName: 'John',
      lastName: 'Doe',
    });
    expect(schema.parse({ name: 'Jane Roe' })).toEqual({
      firstName: 'Jane',
      lastName: 'Roe',
    });
  });

  test('array-form mapper return type is checked', () => {
    funnel(Person).from([
      // @ts-expect-error — mapper must return the canonical input shape
      [z.object({ x: z.string() }), ({ x }) => ({ wrong: x })],
    ]);
  });

  test('.from() does not mutate the schema it was called on', () => {
    const base = funnel(Person).from(
      z.object({ full_name: z.string() }),
      ({ full_name }) => splitName(full_name),
    );
    const extended = base.from(z.object({ name: z.string() }), ({ name }) =>
      splitName(name),
    );
    expect(base.safeParse({ name: 'John Doe' }).success).toBe(false);
    expect(extended.safeParse({ name: 'John Doe' }).success).toBe(true);
  });
});
