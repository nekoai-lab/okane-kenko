import { describe, expect, it } from "vitest";
import { firstWarekiDate } from "./wareki.js";

describe("firstWarekiDate：和暦→西暦（決定的）", () => {
  it("全角の和暦を西暦にする（厚労省 Q&A の書き方）", () => {
    expect(firstWarekiDate("退職日が令和７年４月１日以降である場合は原則１か月")).toBe(
      "2025-04-01",
    );
  });
  it("元年と平成・昭和", () => {
    expect(firstWarekiDate("令和元年5月1日から")).toBe("2019-05-01");
    expect(firstWarekiDate("平成31年4月30日まで")).toBe("2019-04-30");
    expect(firstWarekiDate("昭和31年4月2日以後生まれ")).toBe("1956-04-02");
  });
  it("日付が無ければ null（無い日付を作らない）", () => {
    expect(firstWarekiDate("原則１か月です")).toBeNull();
  });
});
