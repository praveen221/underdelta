import type { ReactNode } from "react";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <section>
      <nav>Dashboard nav</nav>
      {children}
    </section>
  );
}
