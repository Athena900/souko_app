import type { FieldWorkInput, PriceRule } from "@/src/domain/types";

export const demoPriceRules: PriceRule[] = [
  {
    id: "demo-shipment-handling",
    version: 1,
    workCode: "shipment_handling",
    kind: "shipment",
    unitPriceYen: 500,
    taxRateBps: 1_000,
    effectiveFrom: "2026-01-01",
    priority: 10,
  },
  {
    id: "demo-pack-count",
    version: 1,
    workCode: "pack_count",
    kind: "pack",
    unitPriceYen: 100,
    taxRateBps: 1_000,
    effectiveFrom: "2026-01-01",
    priority: 10,
  },
  {
    id: "demo-bubble-wrap",
    version: 1,
    workCode: "bubble_wrap",
    kind: "material",
    materialCode: "bubble_wrap",
    unitPriceYen: 20,
    taxRateBps: 1_000,
    effectiveFrom: "2026-01-01",
    priority: 10,
  },
  {
    id: "demo-extra-pack",
    version: 1,
    workCode: "extra_pack",
    kind: "additional_work",
    unitPriceYen: 300,
    taxRateBps: 1_000,
    effectiveFrom: "2026-01-01",
    priority: 10,
  },
];

export const demoFieldWorkInput: FieldWorkInput = {
  clientId: "demo-client",
  siteId: "demo-site",
  shipmentNo: "DEMO-001",
  workDate: "2026-08-06",
  packCount: 2,
  materialLines: [{ code: "bubble_wrap", name: "緩衝材", quantity: 3 }],
  additionalWorkLines: [{ code: "extra_pack", name: "追加梱包", quantity: 1 }],
  boxDetails: [
    {
      boxNo: "1",
      items: [{ sku: "SKU-001", name: "サンプル商品", quantity: 1 }],
      materialLines: [],
    },
  ],
  notes: "デモ入力",
};
