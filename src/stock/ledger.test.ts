import { describe, expect, it } from "vitest";
import {
  countDiffs,
  stockByItem,
  stockLots,
  totalQty,
  type Movement,
} from "./ledger";

function mv(
  overrides: Partial<Movement> & Pick<Movement, "seq" | "kind">
): Movement {
  return {
    item_id: "item-1",
    qty: 0,
    mfg_date: null,
    expected_qty: null,
    batch_id: null,
    ...overrides,
  };
}

describe("stockLots", () => {
  it("reset bằng count và adjust ghi đè các Lô", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 10 }),
      mv({ seq: 2, kind: "assign_mfg", qty: 4, mfg_date: "2026-10-01" }),
      mv({ seq: 3, kind: "adjust", qty: 5 }),
    ];

    expect(stockLots(movements)).toEqual([{ mfgDate: null, qty: 5 }]);
    expect(totalQty(stockLots(movements))).toBe(5);
  });

  it("assign_mfg chuyển đúng, gộp cùng ngày, quá số lượng chỉ lấy phần còn", () => {
    const movements: Movement[] = [
      mv({ seq: 3, kind: "assign_mfg", qty: 2, mfg_date: "2026-10-20" }),
      mv({ seq: 1, kind: "count", qty: 10 }),
      mv({ seq: 4, kind: "assign_mfg", qty: 99, mfg_date: "2026-10-05" }),
      mv({ seq: 2, kind: "assign_mfg", qty: 3, mfg_date: "2026-10-20" }),
    ];

    const lots = stockLots(movements);
    expect(lots).toEqual([
      { mfgDate: "2026-10-05", qty: 5 },
      { mfgDate: "2026-10-20", qty: 5 },
    ]);
    expect(totalQty(lots)).toBe(10);
  });

  it("sắp xếp hai Lô theo ngày tăng dần và Lô null ở cuối", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 10 }),
      mv({ seq: 2, kind: "assign_mfg", qty: 3, mfg_date: "2026-10-20" }),
      mv({ seq: 3, kind: "assign_mfg", qty: 2, mfg_date: "2026-10-05" }),
    ];

    expect(stockLots(movements)).toEqual([
      { mfgDate: "2026-10-05", qty: 2 },
      { mfgDate: "2026-10-20", qty: 3 },
      { mfgDate: null, qty: 5 },
    ]);
  });

  it("sau một count mới thì assign_mfg cũ không còn tác dụng", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 10 }),
      mv({ seq: 2, kind: "assign_mfg", qty: 6, mfg_date: "2026-10-01" }),
      mv({ seq: 3, kind: "count", qty: 4 }),
    ];

    expect(stockLots(movements)).toEqual([{ mfgDate: null, qty: 4 }]);
  });

  it("count qty = 0 trả về mảng rỗng", () => {
    expect(stockLots([mv({ seq: 1, kind: "count", qty: 0 })])).toEqual([]);
  });
});

describe("stockByItem", () => {
  it("nhóm đúng theo item_id", () => {
    const map = stockByItem([
      mv({ seq: 1, item_id: "a", kind: "count", qty: 5 }),
      mv({ seq: 2, item_id: "b", kind: "count", qty: 8 }),
      mv({
        seq: 3,
        item_id: "a",
        kind: "assign_mfg",
        qty: 2,
        mfg_date: "2026-10-01",
      }),
    ]);

    expect(map.get("a")).toEqual([
      { mfgDate: "2026-10-01", qty: 2 },
      { mfgDate: null, qty: 3 },
    ]);
    expect(map.get("b")).toEqual([{ mfgDate: null, qty: 8 }]);
  });
});

describe("countDiffs", () => {
  it("bỏ món không lệch và giữ thứ tự seq", () => {
    const diffs = countDiffs(
      [
        mv({
          seq: 5,
          item_id: "c",
          kind: "count",
          qty: 3,
          expected_qty: 5,
          batch_id: "b1",
        }),
        mv({
          seq: 2,
          item_id: "a",
          kind: "count",
          qty: 10,
          expected_qty: 8,
          batch_id: "b1",
        }),
        mv({
          seq: 3,
          item_id: "b",
          kind: "count",
          qty: 4,
          expected_qty: 4,
          batch_id: "b1",
        }),
        mv({
          seq: 4,
          item_id: "d",
          kind: "count",
          qty: 7,
          expected_qty: null,
          batch_id: "b1",
        }),
        mv({
          seq: 1,
          item_id: "other",
          kind: "count",
          qty: 1,
          expected_qty: 2,
          batch_id: "b2",
        }),
      ],
      "b1"
    );

    expect(diffs).toEqual([
      { item_id: "a", expected: 8, actual: 10, diff: 2 },
      { item_id: "c", expected: 5, actual: 3, diff: -2 },
    ]);
  });
});
