import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Fixture gate: protected matchers redirect unauthenticated traffic to /login. */
export function middleware(request: NextRequest) {
  const authed = request.cookies.get("session")?.value;
  if (!authed) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/profile/:path*",
  ],
};
