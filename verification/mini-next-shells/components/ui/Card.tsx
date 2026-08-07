/** Presentational leaf — Intermediate shell focus must not surface this. */
export function Card({
  children,
}: {
  children: unknown;
}) {
  return <section className="card">{children}</section>;
}
