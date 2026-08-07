/** Presentational leaf — Intermediate shell focus must not surface this. */
export function Button({
  children,
}: {
  children: unknown;
}) {
  return <button type="button">{children}</button>;
}
