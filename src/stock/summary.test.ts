import { describe, expect, it } from "vitest";
import type { Lot } from "./ledger";
import { filterByFlag, stockSummary, type SummaryItem } from "./summary";

// Dữ liệu chung chung; hạn tính từ NSX + thời hạn 10 ngày.
const item = (id: string, over: Partial<SummaryItem> = {}): SummaryItem => ({
  id,
  shelf_life: 10,
  shelf_life_unit: "day",
  shelf_life_from_receipt_days: null,
  shelf_life_after_open: null,
  shelf_life_after_open_unit: "day",
  ...over,
});
const today = "2026-11-20";
const fresh: Lot = { mfgDate: "2026-11-18", qty: 3 }; // hết hạn 27/11, còn hạn
const old: Lot = { mfgDate: "2026-11-01", qty: 2 }; // hết hạn 10/11, quá hạn

describe("tóm tắt Tồn kho", () => {
  const items = [
    item("a"), // đã kiểm, còn hạn
    item("b"), // chưa kiểm
    item("c"), // đã kiểm, có lô quá hạn
    item("d"), // đã kiểm, hàng đang về
  ];
  const input = {
    items,
    lotsByItem: new Map<string, Lot[]>([
      ["a", [fresh]],
      ["b", [fresh]],
      ["c", [fresh, old]],
      ["d", [fresh]],
    ]),
    checked: new Set(["a", "c", "d"]),
    incoming: new Map([["d", 12]]),
    today,
  };

  it("đếm số món chưa kiểm, quá hạn, đang về", () => {
    expect(stockSummary(input).counts).toEqual({
      unchecked: 1,
      expired: 1,
      incoming: 1,
    });
  });

  it("món không có tồn hay không đang về thì không tính quá hạn/đang về", () => {
    const s = stockSummary({
      ...input,
      lotsByItem: new Map(),
      incoming: new Map([["d", 0]]),
    });
    expect(s.counts).toEqual({ unchecked: 1, expired: 0, incoming: 0 });
  });

  it("lọc theo từng loại: chỉ giữ món thuộc loại đó", () => {
    const s = stockSummary(input);
    expect(filterByFlag(items, s, "unchecked").map((i) => i.id)).toEqual(["b"]);
    expect(filterByFlag(items, s, "expired").map((i) => i.id)).toEqual(["c"]);
    expect(filterByFlag(items, s, "incoming").map((i) => i.id)).toEqual(["d"]);
  });

  it("không chọn loại nào thì giữ nguyên danh sách", () => {
    const s = stockSummary(input);
    expect(filterByFlag(items, s, null)).toEqual(items);
  });

  it("món skip_count chưa kiểm không vào unchecked nhưng vẫn tính quá hạn/đang về", () => {
    const s = stockSummary({
      items: [
        item("b"), // món thường chưa kiểm
        item("e", { skip_count: true } as Partial<SummaryItem>), // ngừng bán, chưa kiểm, có lô quá hạn + đang về
      ],
      lotsByItem: new Map<string, Lot[]>([
        ["b", [fresh]],
        ["e", [old]],
      ]),
      checked: new Set(),
      incoming: new Map([["e", 5]]),
      today,
    });
    expect(Array.from(s.ids.unchecked)).toEqual(["b"]);
    expect(Array.from(s.ids.expired)).toEqual(["e"]);
    expect(Array.from(s.ids.incoming)).toEqual(["e"]);
    expect(s.counts).toEqual({
      unchecked: 1,
      expired: 1,
      incoming: 1,
    });
  });
});
