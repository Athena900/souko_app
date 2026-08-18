import { z } from "zod";

const id = z.string().trim().min(1).max(120);
const optionalId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  id.optional(),
);
const positiveInteger = z.number().int().min(0).max(1_000_000);
const yenAmount = z.number().int().min(0).max(1_000_000_000_000_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DDで入力してください");

export const materialLineSchema = z
  .object({
    code: id,
    name: id,
    quantity: positiveInteger,
  })
  .strict();

export const additionalWorkLineSchema = z
  .object({
    code: id,
    name: id,
    quantity: positiveInteger,
  })
  .strict();

export const boxItemSchema = z
  .object({
    sku: id,
    name: optionalId,
    quantity: positiveInteger,
  })
  .strict();

export const boxDetailSchema = z
  .object({
    boxNo: id,
    items: z.array(boxItemSchema).max(100),
    materialLines: z.array(materialLineSchema).max(100),
  })
  .strict();

export const fieldWorkInputSchema = z
  .object({
    idempotencyKey: id.max(200).optional(),
    clientId: id,
    siteId: id,
    shipmentNo: id,
    workDate: date,
    packCount: positiveInteger,
    materialLines: z.array(materialLineSchema).max(100),
    additionalWorkLines: z.array(additionalWorkLineSchema).max(100),
    boxDetails: z.array(boxDetailSchema).max(100),
    exceptionReason: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2_000).optional(),
    photoPaths: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const boxNumbers = value.boxDetails.map((box) => box.boxNo);
    if (new Set(boxNumbers).size !== boxNumbers.length) {
      context.addIssue({
        code: "custom",
        path: ["boxDetails"],
        message: "箱番号は重複させないでください",
      });
    }

    if (value.boxDetails.some((box) => box.items.length === 0)) {
      context.addIssue({
        code: "custom",
        path: ["boxDetails"],
        message: "商品を入力していない箱があります",
      });
    }

    if (value.exceptionReason && value.exceptionReason.length > 0 && !value.notes) {
      context.addIssue({
        code: "custom",
        path: ["notes"],
        message: "例外理由を入力した場合は備考も入力してください",
      });
    }
  });

export const priceRuleSchema = z
  .object({
    id,
    version: z.number().int().positive(),
    workCode: id,
    kind: z.enum(["shipment", "pack", "material", "additional_work"]),
    materialCode: id.optional(),
    unitPriceYen: z.number().int().min(0).max(100_000_000),
    taxRateBps: z.number().int().min(0).max(10_000),
    effectiveFrom: date,
    effectiveTo: date.optional(),
    priority: z.number().int().min(0).max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({ code: "custom", path: ["effectiveTo"], message: "適用終了日は開始日以降にしてください" });
    }
    if (value.kind === "material" && !value.materialCode) {
      context.addIssue({ code: "custom", path: ["materialCode"], message: "資材単価には資材コードが必要です" });
    }
  });

export const billingPreviewRequestSchema = z
  .object({
    sourceId: id,
    calculationRunId: id.optional(),
    record: fieldWorkInputSchema,
    // デモモードでは画面から渡せる。本番ではサーバー側の承認済み単価を使い、値を無視する。
    priceRules: z.array(priceRuleSchema).min(1).max(500).optional(),
  })
  .strict();

export const billingCandidateRequestSchema = z
  .object({
    clientId: id,
    siteId: id,
    fieldWorkRecordId: id,
    recalculate: z.boolean().optional(),
  })
  .strict();

export const billingCandidateReviewRequestSchema = z
  .object({
    clientId: id,
    siteId: id,
    candidateId: id,
    status: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(2_000).optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const billingCandidateLookupQuerySchema = z
  .object({
    clientId: id,
    siteId: id,
    candidateId: id,
  })
  .strict();

const billingCandidateLineSchema = z
  .object({
    sourceType: z.enum(["field_work", "shipment"]),
    sourceId: id,
    workCode: id,
    description: id,
    quantity: positiveInteger,
    unitPriceYen: yenAmount,
    subtotalYen: yenAmount,
    taxYen: yenAmount,
    totalYen: yenAmount,
    priceRuleId: id,
    priceRuleVersion: z.number().int().positive(),
    calculationRunId: id,
  })
  .strict();

export const billingCandidateResponseSchema = z
  .object({
    id,
    fieldWorkRecordId: id,
    clientId: id,
    siteId: id,
    shipmentNo: id,
    workDate: date,
    calculation: z
      .object({
        calculationRunId: id,
        lines: z.array(billingCandidateLineSchema).max(500),
        subtotalYen: yenAmount,
        taxYen: yenAmount,
        totalYen: yenAmount,
        warnings: z.array(z.string().max(500)).max(100),
      })
      .strict(),
    status: z.enum(["ready", "review_required", "approved", "rejected"]),
    reviewedAt: z.string().max(100).optional(),
    reviewNote: z.string().max(2_000).optional(),
    updatedAt: z.string().datetime({ offset: true }).optional(),
    demo: z.boolean(),
    persisted: z.boolean(),
  })
  .strict();

export const rawShipmentRowSchema = z
  .object({
    clientId: id,
    siteId: id,
    shipmentNo: id,
    workDate: date,
    packCount: z.coerce.number().int().min(0).max(1_000_000),
  })
  .strict();

export type FieldWorkInputValidated = z.infer<typeof fieldWorkInputSchema>;
export type BillingPreviewRequest = z.infer<typeof billingPreviewRequestSchema>;
