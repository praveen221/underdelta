import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>Scholar portal</header>
        {children}
      </body>
    </html>
  );
}
