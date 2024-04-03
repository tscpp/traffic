export type BodyInit = import('undici-types/fetch').BodyInit;
export type HeadersInit = import('undici-types/fetch').HeadersInit;

export function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
