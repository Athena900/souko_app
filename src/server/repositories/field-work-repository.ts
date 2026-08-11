import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import type { FieldWorkInput } from "@/src/domain/types";
import { fieldWorkInputSchema } from "@/src/domain/validation";

export class UnauthorizedError extends Error {}
export class DuplicateRecordError extends Error {}
export class PersistenceError extends Error {}

export interface StoredFieldWorkRecord {
  id: string;
  status: string;
  createdAt: string;
  demo: boolean;
}

export interface BillingSourceFieldWorkRecord {
  id: string;
  input: FieldWorkInput;
  status: string;
  createdAt: string;
  demo: boolean;
}

export interface FieldWorkRecordListFilters {
  clientId: string;
  siteId: string;
  limit: number;
}

export interface FieldWorkRepository {
  create(input: FieldWorkInput): Promise<StoredFieldWorkRecord>;
}

export function createSupabaseFieldWorkRepository(): FieldWorkRepository {
  return {
    async create(input) {
      let supabase;
      try {
        supabase = await createSupabaseServerClient();
      } catch {
        throw new PersistenceError("Supabaseに接続できませんでした");
      }
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new UnauthorizedError("ログインが必要です");
      }

      const { data: shipment, error: shipmentError } = await supabase
        .from("shipments")
        .select("id")
        .eq("client_id", input.clientId)
        .eq("site_id", input.siteId)
        .eq("shipment_no", input.shipmentNo)
        .maybeSingle();
      if (shipmentError) throw new PersistenceError("出荷番号を確認できませんでした");
      if (!shipment) throw new PersistenceError("登録済みの出荷番号を選択してください");

      const idempotencyKey = `${user.id}:${input.clientId}:${input.siteId}:${input.idempotencyKey ?? crypto.randomUUID()}`;
      if (input.photoPaths && input.photoPaths.length > 0) {
        throw new PersistenceError("写真は専用アップロード処理から登録してください");
      }
      const { data, error } = await supabase
        .from("field_work_records")
        .insert({
          client_id: input.clientId,
          site_id: input.siteId,
          shipment_no: input.shipmentNo,
          shipment_id: shipment.id,
          work_date: input.workDate,
          entered_by: user.id,
          idempotency_key: idempotencyKey,
          pack_count: input.packCount,
          material_lines: input.materialLines,
          additional_work_lines: input.additionalWorkLines,
          box_details: input.boxDetails,
          exception_reason: input.exceptionReason ?? null,
          notes: input.notes ?? null,
          photo_paths: [],
          status: "submitted",
        })
        .select("id,status,created_at")
        .single();

      if (error?.code === "23505") {
        throw new DuplicateRecordError("同じ入力はすでに登録されています");
      }
      if (error || !data) {
        throw new PersistenceError("保存に失敗しました");
      }

      return { id: data.id, status: data.status, createdAt: data.created_at, demo: false };
    },
  };
}

interface DemoFieldWorkRecordEntry {
  stored: StoredFieldWorkRecord;
  input: FieldWorkInput;
}

const demoRecords = new Map<string, DemoFieldWorkRecordEntry>();

export function createDemoFieldWorkRepository(): FieldWorkRepository {
  return {
    async create(input) {
      const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
      const existing = demoRecords.get(idempotencyKey);
      if (existing) throw new DuplicateRecordError("同じ入力はすでに登録されています");
      const record = {
        id: `demo-${crypto.randomUUID()}`,
        status: "submitted",
        createdAt: new Date().toISOString(),
        demo: true,
      } satisfies StoredFieldWorkRecord;
      demoRecords.set(idempotencyKey, { stored: record, input: structuredClone(input) });
      return record;
    },
  };
}

export function listDemoBillingSourceFieldWorkRecords(filters: FieldWorkRecordListFilters): BillingSourceFieldWorkRecord[] {
  return [...demoRecords.values()]
    .filter(({ input }) => input.clientId === filters.clientId && input.siteId === filters.siteId)
    .sort((left, right) => right.stored.createdAt.localeCompare(left.stored.createdAt))
    .slice(0, filters.limit)
    .map(({ stored, input }) => ({ id: stored.id, input: structuredClone(input), status: stored.status, createdAt: stored.createdAt, demo: true }));
}

export function getDemoBillingSourceFieldWorkRecord(
  id: string,
  clientId: string,
  siteId: string,
): BillingSourceFieldWorkRecord | null {
  for (const { stored, input } of demoRecords.values()) {
    if (stored.id === id && input.clientId === clientId && input.siteId === siteId) {
      return { id: stored.id, input: structuredClone(input), status: stored.status, createdAt: stored.createdAt, demo: true };
    }
  }
  return null;
}

export async function listSupabaseBillingSourceFieldWorkRecords(
  filters: FieldWorkRecordListFilters,
): Promise<BillingSourceFieldWorkRecord[]> {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    throw new PersistenceError("Supabaseに接続できませんでした");
  }

  const { data, error } = await supabase
    .from("field_work_records")
    .select("id,client_id,site_id,shipment_no,work_date,pack_count,material_lines,additional_work_lines,box_details,exception_reason,notes,photo_paths,status,created_at")
    .eq("client_id", filters.clientId)
    .eq("site_id", filters.siteId)
    .in("status", ["submitted", "review_required", "accepted"])
    .order("recorded_at", { ascending: false })
    .limit(filters.limit);
  if (error) throw new PersistenceError("現場記録を読み込めませんでした");

  return (data ?? []).map((row) => mapSupabaseBillingSourceFieldWorkRecord(row));
}

export async function getSupabaseBillingSourceFieldWorkRecord(
  id: string,
  clientId: string,
  siteId: string,
): Promise<BillingSourceFieldWorkRecord | null> {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    throw new PersistenceError("Supabaseに接続できませんでした");
  }

  const { data, error } = await supabase
    .from("field_work_records")
    .select("id,client_id,site_id,shipment_no,work_date,pack_count,material_lines,additional_work_lines,box_details,exception_reason,notes,photo_paths,status,created_at")
    .eq("id", id)
    .eq("client_id", clientId)
    .eq("site_id", siteId)
    .in("status", ["submitted", "review_required", "accepted"])
    .maybeSingle();
  if (error) throw new PersistenceError("現場記録を読み込めませんでした");
  return data ? mapSupabaseBillingSourceFieldWorkRecord(data) : null;
}

function mapSupabaseBillingSourceFieldWorkRecord(row: Record<string, unknown>): BillingSourceFieldWorkRecord {
  const parsed = fieldWorkInputSchema.safeParse({
    clientId: row.client_id,
    siteId: row.site_id,
    shipmentNo: row.shipment_no,
    workDate: row.work_date,
    packCount: row.pack_count,
    materialLines: row.material_lines ?? [],
    additionalWorkLines: row.additional_work_lines ?? [],
    boxDetails: row.box_details ?? [],
    exceptionReason: row.exception_reason ?? undefined,
    notes: row.notes ?? undefined,
    photoPaths: row.photo_paths ?? [],
  });
  if (!parsed.success || typeof row.id !== "string" || typeof row.status !== "string" || typeof row.created_at !== "string") {
    throw new PersistenceError("現場記録の内容を確認できませんでした");
  }
  return { id: row.id, input: parsed.data, status: row.status, createdAt: row.created_at, demo: false };
}

export function resetDemoFieldWorkRecords(): void {
  demoRecords.clear();
}
