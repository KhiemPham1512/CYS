import { describe, expect, it } from "vitest";
import type { RawLine } from "./orderReconcile";
import { packReadResults, unpackReadResults } from "./readOrderCache";

const line = (name: string): RawLine => ({
  name,
  qty: 2,
  unit: "Bao",
  pack: null,
  orderCode: "S1",
});
const HOUR = 3_600_000;

describe("lưu kết quả đọc ảnh đơn", () => {
  const parts = [[line("A")], [line("B"), line("C")]];

  it("lưu rồi đọc lại trong 24 giờ thì ra đúng các dòng", () => {
    const raw = packReadResults(parts, 1_000_000);
    expect(unpackReadResults(raw, 1_000_000 + 5 * HOUR)).toEqual({
      parts,
      savedAt: 1_000_000,
    });
  });

  it("quá 24 giờ thì bỏ", () => {
    const raw = packReadResults(parts, 1_000_000);
    expect(unpackReadResults(raw, 1_000_000 + 25 * HOUR)).toBeNull();
  });

  it("không có gì, hỏng JSON hoặc sai dạng thì bỏ, không làm hỏng màn hình", () => {
    expect(unpackReadResults(null, 0)).toBeNull();
    expect(unpackReadResults("{hỏng", 0)).toBeNull();
    expect(unpackReadResults('{"savedAt":1,"parts":"x"}', 2)).toBeNull();
    expect(
      unpackReadResults('{"savedAt":1,"parts":[[{"name":5}]]}', 2)
    ).toBeNull();
  });

  it("bỏ dòng thiếu tên hoặc số lượng không phải số", () => {
    const raw = JSON.stringify({
      savedAt: 1,
      parts: [[{ name: "", qty: 1, unit: "x" }]],
    });
    expect(unpackReadResults(raw, 2)).toBeNull();
  });

  it("danh sách ảnh trống thì không lưu được gì", () => {
    expect(unpackReadResults(packReadResults([], 1), 2)).toBeNull();
  });
});
