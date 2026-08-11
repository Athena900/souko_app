import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export type RegisteredShipmentStatus = "ready" | "exception" | "cancelled";

export interface RegisteredShipment {
  id: string;
  shipmentNo: string;
  workDate: string;
  packCount: number;
  status: RegisteredShipmentStatus;
}

export interface ShipmentListFilters {
  clientId: string;
  siteId: string;
  search?: string;
  workDate?: string;
  limit: number;
}

export class ShipmentListPersistenceError extends Error {}

export async function listSupabaseShipments(filters: ShipmentListFilters): Promise<RegisteredShipment[]> {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    throw new ShipmentListPersistenceError("Supabaseに接続できませんでした");
  }

  let query = supabase
    .from("shipments")
    .select("id,shipment_no,work_date,pack_count,status")
    .eq("client_id", filters.clientId)
    .eq("site_id", filters.siteId)
    .eq("status", "ready");

  if (filters.search) query = query.ilike("shipment_no", `%${filters.search}%`);
  if (filters.workDate) query = query.eq("work_date", filters.workDate);

  const { data, error } = await query
    .order("work_date", { ascending: false })
    .order("shipment_no", { ascending: true })
    .limit(filters.limit);

  if (error) throw new ShipmentListPersistenceError("登録済み出荷を読み込めませんでした");

  return (data ?? []).map((row) => ({
    id: row.id,
    shipmentNo: row.shipment_no,
    workDate: row.work_date,
    packCount: row.pack_count,
    status: row.status,
  }));
}
