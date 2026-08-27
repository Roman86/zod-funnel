import * as z from 'zod';

export interface FunnelBuilder<T extends z.ZodType<any, any>> {
  from<S extends z.ZodType<any, any>>(
    source: S,
    map: (data: z.output<S>) => z.input<T>,
  ): FunnelSchema<T>;
}

export type FunnelSchema<T extends z.ZodType<any, any>> = z.ZodType<
  z.output<T>
> &
  FunnelBuilder<T>;

/**
 * Accepts data in the canonical shape of `target`, or in any alternate shape
 * registered via `.from(source, map)`. Alternates are tried in declaration
 * order after the canonical shape; each mapper's output is re-validated
 * against `target`.
 *
 * The result of `funnel(target)` alone is not a schema — at least one
 * `.from()` is required.
 */
export function funnel<T extends z.ZodType<any, any>>(
  target: T,
): FunnelBuilder<T> {
  const extend = (options: z.ZodType<z.output<T>>[]): FunnelBuilder<T> => ({
    from(source, map) {
      const next = [...options, source.transform(map).pipe(target)];
      return Object.assign(z.union(next), extend(next));
    },
  });
  return extend([target]);
}
