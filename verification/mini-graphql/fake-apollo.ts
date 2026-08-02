/** Minimal gql tag so the fixture does not need a real Apollo dependency. */
export function gql(
  strings: TemplateStringsArray,
  ..._exprs: unknown[]
): string {
  return strings.join("");
}
