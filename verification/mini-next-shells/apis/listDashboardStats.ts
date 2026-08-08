/** Client API helper — Protected Dashboard tool → HTTP API story fuel. */
export async function listDashboardStats(): Promise<{
  activeUsers: number;
  openTasks: number;
}> {
  const response = await fetch("https://api.example.test/dashboard/stats");
  if (!response.ok) {
    throw new Error("Failed to load dashboard stats");
  }
  return response.json();
}
