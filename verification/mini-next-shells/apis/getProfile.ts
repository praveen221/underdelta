/** Client API helper — Profile page body calls this directly. */
export async function getProfile(): Promise<{
  name: string;
  email: string;
}> {
  return { name: "Ada", email: "ada@example.com" };
}
