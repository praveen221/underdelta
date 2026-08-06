/** Client API helper — mirrors Learn `src/apis/**` axios/fetch wrappers. */
export async function listPosts(): Promise<{ id: string; title: string }[]> {
  const response = await fetch("/api/posts");
  if (!response.ok) {
    throw new Error("Failed to list posts");
  }
  return response.json();
}
