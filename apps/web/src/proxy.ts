import { type NextRequest, NextResponse } from "next/server";

/**
 * Inject the ngrok-skip-browser-warning header on every response so the
 * ngrok free-tier interstitial page never blocks the Telegram WebView.
 * This header is harmless in production (non-ngrok hosts ignore it).
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("ngrok-skip-browser-warning", "true");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
