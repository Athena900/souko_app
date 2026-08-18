import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isTrialEnvironment(): boolean {
  return process.env.APP_ENV === "trial";
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Middlewareは画面遷移の補助だけ。APIの実権限判定はrequireMembershipで行う。
  let hasAuthenticatedUser = false;
  try {
    const { data } = await supabase.auth.getClaims();
    // getClaims() は未ログインでも空の data / claims オブジェクトを返す場合がある。
    // 利用者ID（sub）があるときだけ認証済みとして扱う。
    hasAuthenticatedUser = typeof data?.claims?.sub === "string" && data.claims.sub.length > 0;
  } catch {
    // 試用版では認証基盤に到達できない場合も、未ログインとして入口へ戻す。
  }
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isPasswordSetupPage = request.nextUrl.pathname === "/set-password";
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");
  if (isTrialEnvironment() && !isApiRequest && !isLoginPage && !isPasswordSetupPage && !hasAuthenticatedUser) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
