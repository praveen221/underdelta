export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div data-shell="auth">{children}</div>;
}
