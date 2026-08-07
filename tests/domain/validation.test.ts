import { describe, expect, it } from "vitest";
import { fieldWorkInputSchema } from "@/src/domain/validation";
import { demoFieldWorkInput } from "@/src/domain/demo-fixtures";

describe("fieldWorkInputSchema", () => {
  it("accepts a valid field record", () => {
    expect(fieldWorkInputSchema.safeParse(demoFieldWorkInput).success).toBe(true);
  });

  it("rejects duplicate box numbers", () => {
    const result = fieldWorkInputSchema.safeParse({
      ...demoFieldWorkInput,
      boxDetails: [
        { boxNo: "1", items: [], materialLines: [] },
        { boxNo: "1", items: [], materialLines: [] },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === "boxDetails")).toBe(true);
  });

  it("requires notes when an exception reason is provided", () => {
    const result = fieldWorkInputSchema.safeParse({ ...demoFieldWorkInput, exceptionReason: "数量差異", notes: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === "notes")).toBe(true);
  });
});
