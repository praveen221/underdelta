/** Presentational leaf — not a feature root (imported by PostList, not by a page). */
export function Card({
  children,
}: {
  children: unknown;
}) {
  return <section className="card">{children}</section>;
}
