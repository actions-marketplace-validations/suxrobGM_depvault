/** First displayable message from a field's `meta.errors` (Zod issues, strings, or thrown values). */
export function firstErrorMessage(errors: ReadonlyArray<unknown>): string | undefined {
  const first = errors[0];
  if (!first) {
    return undefined;
  }
  if (typeof first === "string") {
    return first;
  }
  return (first as { message?: string }).message ?? String(first);
}
