import { describe, expect, it } from "vitest";
import { ConsentRequestSchema } from "./schema.js";

describe("ConsentRequestSchema", () => {
  it("query文字列を受け付ける", () => {
    const parsed = ConsentRequestSchema.safeParse({ query: "v=1&sb=1989" });
    expect(parsed.success).toBe(true);
  });

  it("空文字列は拒否する", () => {
    const parsed = ConsentRequestSchema.safeParse({ query: "" });
    expect(parsed.success).toBe(false);
  });

  it("queryが無ければ拒否する", () => {
    const parsed = ConsentRequestSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});
