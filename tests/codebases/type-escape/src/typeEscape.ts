/* eslint-disable @typescript-eslint/no-explicit-any */
/* biome-ignore-all lint/suspicious/noExplicitAny: fixture intentionally contains unsafe any casts */

type WirePayload = {
  id: unknown;
  amount: unknown;
  metadata?: unknown;
};

export function unsafeParse(payload: WirePayload): {
  id: string;
  amount: number;
  metadata?: Record<string, unknown>;
} {
  const id = payload.id as any;
  const amount = payload.amount as any;
  const metadata = payload.metadata as unknown as Record<string, unknown>;

  return {
    id,
    amount,
    metadata,
  };
}
