/** Presentational leaf — not a feature root (imported by PostForm, not by a page). */
export function Button({
  children,
}: {
  children: unknown;
}) {
  return <button type="submit">{children}</button>;
}
