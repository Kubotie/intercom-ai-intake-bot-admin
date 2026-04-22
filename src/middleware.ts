import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin Console"' },
  });
}

export function middleware(req: NextRequest) {
  // CVE-2025-29927: x-middleware-subrequest ヘッダーによる認証バイパスを防ぐ
  if (req.headers.get("x-middleware-subrequest")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ADMIN_PASSWORD が未設定の場合はローカル開発とみなして通過
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return unauthorized();
  }

  // "username:password" から password 部分だけを比較
  const colon = decoded.indexOf(":");
  const pwd = colon >= 0 ? decoded.slice(colon + 1) : decoded;
  if (pwd !== password) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
