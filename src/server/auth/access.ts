import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { usesDemoMemoryStorage, usesSupabaseStorage } from "@/src/lib/env";

export class RouteUnauthorizedError extends Error {}
export class RouteForbiddenError extends Error {}
export class RouteConfigurationError extends Error {}
export class RoutePayloadTooLargeError extends Error {}
export class RouteBodyParseError extends Error {}

export function assertSameOrigin(request: Request): void {
  if (usesDemoMemoryStorage()) return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) throw new RouteForbiddenError("不正なリクエストです");
  try {
    if (new URL(origin).host !== host) throw new RouteForbiddenError("不正なリクエストです");
  } catch {
    throw new RouteForbiddenError("不正なリクエストです");
  }
}

export function assertBodySize(request: Request, maxBytes: number): void {
  const contentLength = request.headers.get("content-length");
  const length = contentLength ? Number(contentLength) : Number.NaN;
  if (Number.isFinite(length) && length > maxBytes) throw new RoutePayloadTooLargeError("リクエストが大きすぎます");
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new RoutePayloadTooLargeError("リクエストが大きすぎます");
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new RouteBodyParseError("JSON形式の入力が必要です");
  }
}

export async function requireMembership(
  clientId: string,
  siteId: string,
  roles: readonly ("field" | "office" | "manager" | "admin")[],
): Promise<{ userId: string; role: string }> {
  if (!usesSupabaseStorage()) return { userId: "demo-user", role: "admin" };

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new RouteUnauthorizedError("ログインが必要です");

    const { data, error } = await supabase
      .from("user_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .eq("site_id", siteId)
      .eq("active", true)
      .in("role", [...roles])
      .maybeSingle();
    if (error) throw new RouteConfigurationError("権限を確認できませんでした");
    if (!data) throw new RouteForbiddenError("この荷主・拠点への権限がありません");
    return { userId: user.id, role: data.role };
  } catch (error) {
    if (error instanceof RouteUnauthorizedError || error instanceof RouteForbiddenError || error instanceof RouteConfigurationError) {
      throw error;
    }
    throw new RouteConfigurationError("認証基盤に接続できませんでした");
  }
}
