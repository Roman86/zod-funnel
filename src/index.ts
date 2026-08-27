import * as z from 'zod';

export interface FunnelBuilder<T extends z.ZodType<any, any>> {
  from<S extends z.ZodType<any, any>>(
    source: S,
    map: (data: z.output<S>) => z.input<T>,
  ): FunnelSchema<T>;
  from<Sources extends readonly z.ZodType<any, any>[]>(adapters: {
    [K in keyof Sources]: FunnelAdapter<T, Sources[K]>;
  }): FunnelSchema<T>;
}

export type FunnelSchema<T extends z.ZodType<any, any>> = z.ZodType<
  z.output<T>
> &
  FunnelBuilder<T>;

export type FunnelAdapter<
  T extends z.ZodType<any, any>,
  S extends z.ZodType<any, any> = z.ZodType<any, any>,
> = readonly [source: S, map: (data: z.output<S>) => z.input<T>];

/**
 * Accepts data in the canonical shape of `target`, or in any alternate
 * shape registered via `.from(source, map)` — or several at once via
 * `.from(adapters)` with an array of `[source, map]` pairs. Alternates
 * are tried in declaration order after the canonical shape; each mapper's
 * output is re-validated against `target`.
 *
 * The result of `funnel(target)` alone is not a schema — at least one
 * `.from()` is required (`.from([])` with an empty array yields a schema
 * that accepts only the canonical shape).
 */
export function funnel<T extends z.ZodType<any, any>>(
  target: T,
): FunnelBuilder<T> {
  const toOption = ([source, map]: FunnelAdapter<T>) =>
    source.transform(map).pipe(target);
  const extend = (options: z.ZodType<z.output<T>>[]): FunnelBuilder<T> => ({
    from(
      sourceOrAdapters: z.ZodType<any, any> | ReadonlyArray<FunnelAdapter<T>>,
      map?: (data: any) => z.input<T>,
    ) {
      const added: ReadonlyArray<FunnelAdapter<T>> = Array.isArray(
        sourceOrAdapters,
      )
        ? sourceOrAdapters
        : [[sourceOrAdapters, map!]];
      const next = [...options, ...added.map(toOption)];
      return Object.assign(z.union(next), extend(next));
    },
  });
  return extend([target]);
}
