import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import type { FieldWorkInput } from "@/src/domain/types";

export class UnauthorizedError extends Error {}
export class DuplicateRecordError extends Error {}
export class PersistenceError extends Error {}

export interface StoredFieldWorkRecord {
  id: string;
  status: string;
  createdAt: string;
  demo: boolean;
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

const demoRecords = new Map<string, StoredFieldWorkRecord>();

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
      demoRecords.set(idempotencyKey, record);
      return record;
    },
  };
}
