import { NextResponse } from "next/server";
import { hasSupabasePublicEnv, isDemoMode } from "@/src/lib/env";
import {
  assertBodySize,
  assertSameOrigin,
  readJsonBody,
  requireMembership,
  RouteBodyParseError,
  RouteConfigurationError,
  RouteForbiddenError,
  RoutePayloadTooLargeError,
  RouteUnauthorizedError,
} from "@/src/server/auth/access";
import {
  createDemoFieldWorkRepository,
  createSupabaseFieldWorkRepository,
  DuplicateRecordError,
  PersistenceError,
  UnauthorizedError,
} from "@/src/server/repositories/field-work-repository";
import { fieldWorkInputSchema } from "@/src/domain/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertBodySize(request, 1_000_000);
  } catch (error) {
    if (error instanceof RoutePayloadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 403 });
  }
  if (!isDemoMode() && !hasSupabasePublicEnv()) {
    return NextResponse.json({ error: "Supabaseの設定が必要です" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await readJsonBody(request, 1_000_000);
  } catch (error) {
    if (error instanceof RoutePayloadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof RouteBodyParseError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "JSON形式の入力が必要です" }, { status: 400 });
  }

  const parsed = fieldWorkInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力内容を確認してください", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    if (!isDemoMode()) {
      await requireMembership(parsed.data.clientId, parsed.data.siteId, ["field", "office", "manager", "admin"]);
    }
    const repository = isDemoMode() ? createDemoFieldWorkRepository() : createSupabaseFieldWorkRepository();
    const result = await repository.create(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RouteUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof RouteForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof RouteConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof DuplicateRecordError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof PersistenceError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
