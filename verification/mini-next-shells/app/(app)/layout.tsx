/** Fixture layout guard — strong protected signal alongside middleware. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = getServerSession();
  if (!session) {
    redirectToLogin();
  }
  return <div data-shell="protected">{children}</div>;
}

function getServerSession(): { userId: string } | null {
  return { userId: "fixture" };
}

function redirectToLogin(): never {
  throw new Error("redirect:/login");
}
