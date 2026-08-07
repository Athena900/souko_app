import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import type { PriceRule } from "@/src/domain/types";

export async function loadApprovedPriceRules(clientId: string, siteId: string, workDate: string): Promise<PriceRule[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("price_rules")
    .select("id,version,work_code,kind,material_code,unit_price_yen,tax_rate_bps,effective_from,effective_to,priority")
    .eq("client_id", clientId)
    .eq("site_id", siteId)
    .not("approved_by", "is", null)
    .lte("effective_from", workDate)
    .or(`effective_to.is.null,effective_to.gte.${workDate}`)
    .order("priority", { ascending: false });

  if (error) throw new Error("承認済み単価を読み込めませんでした");
  return (data ?? []).map((row) => ({
    id: row.id,
    version: row.version,
    workCode: row.work_code,
    kind: row.kind,
    materialCode: row.material_code ?? undefined,
    unitPriceYen: row.unit_price_yen,
    taxRateBps: row.tax_rate_bps,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined,
    priority: row.priority,
  } satisfies PriceRule));
}
