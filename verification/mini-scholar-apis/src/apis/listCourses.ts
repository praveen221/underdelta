/** Client API helper — external Heart backend (no in-repo route handlers). */
export async function listCourses(): Promise<{ id: string; title: string }[]> {
  const response = await fetch("https://api.scholar.test/courses");
  if (!response.ok) {
    throw new Error("Failed to list courses");
  }
  return response.json();
}
