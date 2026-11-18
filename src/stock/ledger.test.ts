import { describe, expect, it } from "vitest";
import {
  countDiffs,
  lastUseToday,
  localDate,
  stockByItem,
  stockLots,
  todaysUses,
  totalQty,
  usageCounts,
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
    created_at: "2026-11-17T05:00:00Z",
    entered_on: null,
    id: `id-${overrides.seq}`,
    voids_id: null,
    created_by: "user-1",
    ...overrides,
  };
}

describe("stockLots", () => {
  it("Điều chỉnh không đổi số lượng thì giữ nguyên Ngày sản xuất", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 19 }),
      mv({ seq: 2, kind: "assign_mfg", qty: 12, mfg_date: "2026-10-28" }),
      mv({ seq: 3, kind: "adjust", qty: 19 }),
    ];

    expect(stockLots(movements)).toEqual([
      { mfgDate: "2026-10-28", qty: 12 },
      { mfgDate: null, qty: 7, enteredOn: "2026-11-17" },
    ]);
  });

  it("Điều chỉnh tăng: phần thêm vào Lô chưa có Ngày sản xuất, Lô có ngày giữ nguyên", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 19 }),
      mv({ seq: 2, kind: "assign_mfg", qty: 19, mfg_date: "2026-10-28" }),
      mv({ seq: 3, kind: "adjust", qty: 25 }),
    ];

    expect(stockLots(movements)).toEqual([
      { mfgDate: "2026-10-28", qty: 19 },
      { mfgDate: null, qty: 6, enteredOn: "2026-11-17" },
    ]);
  });

  it("Điều chỉnh giảm: trừ Lô Ngày sản xuất sớm nhất trước, Lô chưa có ngày trừ sau cùng", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 20 }),
      mv({ seq: 2, kind: "assign_mfg", qty: 5, mfg_date: "2026-10-05" }),
      mv({ seq: 3, kind: "assign_mfg", qty: 10, mfg_date: "2026-10-20" }),
      mv({ seq: 4, kind: "adjust", qty: 12 }),
    ];

    // 20 → 12: bớt 8 = hết Lô 05/10 (5) + 3 của Lô 20/10; Lô chưa có ngày (5) giữ nguyên.
    expect(stockLots(movements)).toEqual([
      { mfgDate: "2026-10-20", qty: 7 },
      { mfgDate: null, qty: 5, enteredOn: "2026-11-17" },
    ]);
    expect(totalQty(stockLots(movements))).toBe(12);
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
      { mfgDate: null, qty: 5, enteredOn: "2026-11-17" },
    ]);
  });

  it("Kiểm kho cũng giữ Ngày sản xuất theo cùng quy tắc", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 10 }),
      mv({ seq: 2, kind: "assign_mfg", qty: 6, mfg_date: "2026-10-01" }),
      mv({ seq: 3, kind: "count", qty: 4 }),
    ];

    // 10 → 4: bớt 6 = Lô 01/10 (6); còn 4 chưa có ngày.
    expect(stockLots(movements)).toEqual([
      { mfgDate: null, qty: 4, enteredOn: "2026-11-17" },
    ]);
  });

  it("phần chưa có Ngày sản xuất tách theo ngày vào kho", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 1, created_at: "2026-11-17T05:00:00Z" }),
      mv({
        seq: 2,
        kind: "adjust",
        qty: 6,
        created_at: "2026-11-18T05:00:00Z",
      }),
    ];

    expect(stockLots(movements)).toEqual([
      { mfgDate: null, qty: 1, enteredOn: "2026-11-17" },
      { mfgDate: null, qty: 5, enteredOn: "2026-11-18" },
    ]);
  });

  it("Thêm Ngày sản xuất cho đúng phần vào kho ngày đó", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 1, created_at: "2026-11-17T05:00:00Z" }),
      mv({
        seq: 2,
        kind: "adjust",
        qty: 6,
        created_at: "2026-11-18T05:00:00Z",
      }),
      mv({
        seq: 3,
        kind: "assign_mfg",
        qty: 5,
        mfg_date: "2026-11-10",
        entered_on: "2026-11-18",
      }),
    ];

    expect(stockLots(movements)).toEqual([
      { mfgDate: "2026-11-10", qty: 5 },
      { mfgDate: null, qty: 1, enteredOn: "2026-11-17" },
    ]);
  });

  it("giảm số lượng: hết Lô có ngày thì trừ phần chưa có ngày vào kho sớm nhất trước", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 1, created_at: "2026-11-17T05:00:00Z" }),
      mv({
        seq: 2,
        kind: "adjust",
        qty: 6,
        created_at: "2026-11-18T05:00:00Z",
      }),
      mv({
        seq: 3,
        kind: "adjust",
        qty: 4,
        created_at: "2026-11-18T06:00:00Z",
      }),
    ];

    expect(stockLots(movements)).toEqual([
      { mfgDate: null, qty: 4, enteredOn: "2026-11-18" },
    ]);
  });

  it("tất cả chưa có ngày: trừ 1 thì mất bao vào kho sớm nhất", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 1, created_at: "2026-11-17T05:00:00Z" }),
      mv({
        seq: 2,
        kind: "adjust",
        qty: 6,
        created_at: "2026-11-18T05:00:00Z",
      }),
      mv({
        seq: 3,
        kind: "adjust",
        qty: 5,
        created_at: "2026-11-19T05:00:00Z",
      }),
    ];

    expect(stockLots(movements)).toEqual([
      { mfgDate: null, qty: 5, enteredOn: "2026-11-18" },
    ]);
  });

  it("về 0 thì hết mọi Lô", () => {
    const movements: Movement[] = [
      mv({ seq: 1, kind: "count", qty: 10 }),
      mv({ seq: 2, kind: "assign_mfg", qty: 6, mfg_date: "2026-10-01" }),
      mv({ seq: 3, kind: "adjust", qty: 0 }),
    ];

    expect(stockLots(movements)).toEqual([]);
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
      { mfgDate: null, qty: 3, enteredOn: "2026-11-17" },
    ]);
    expect(map.get("b")).toEqual([
      { mfgDate: null, qty: 8, enteredOn: "2026-11-17" },
    ]);
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

describe("localDate", () => {
  it("tính ngày theo giờ Việt Nam (UTC+7), không phụ thuộc múi giờ của máy", () => {
    expect(localDate("2026-11-17T16:59:00Z")).toBe("2026-11-17");
    expect(localDate("2026-11-17T17:00:00Z")).toBe("2026-11-18");
    expect(localDate("2026-12-31T20:00:00Z")).toBe("2027-01-01");
  });
});

describe("Ghi dùng", () => {
  const base = [
    mv({ seq: 1, kind: "count", qty: 20 }),
    mv({ seq: 2, kind: "assign_mfg", qty: 5, mfg_date: "2026-10-30" }),
    mv({ seq: 3, kind: "assign_mfg", qty: 5, mfg_date: "2026-10-20" }),
  ];

  it("trừ Lô Ngày sản xuất sớm nhất trước, phần chưa có ngày sau cùng", () => {
    const lots = stockLots([...base, mv({ seq: 4, kind: "use", qty: 7 })]);
    expect(lots).toEqual([
      { mfgDate: "2026-10-30", qty: 3 },
      { mfgDate: null, qty: 10, enteredOn: "2026-11-17" },
    ]);
    const more = stockLots([...base, mv({ seq: 4, kind: "use", qty: 13 })]);
    expect(more).toEqual([{ mfgDate: null, qty: 7, enteredOn: "2026-11-17" }]);
  });

  it("vượt tồn thì tồn về 0, không âm", () => {
    const lots = stockLots([...base, mv({ seq: 4, kind: "use", qty: 99 })]);
    expect(lots).toEqual([]);
  });

  it("Ghi dùng bị hủy thì như chưa ghi", () => {
    const lots = stockLots([
      ...base,
      mv({ seq: 4, kind: "use", qty: 7, id: "u1" }),
      mv({ seq: 5, kind: "void", voids_id: "u1" }),
    ]);
    expect(totalQty(lots)).toBe(20);
  });

  it("todaysUses: chỉ Ghi dùng hôm nay (giờ VN), bỏ dòng đã hủy", () => {
    const now = "2026-11-18T03:00:00Z"; // 10h sáng 18/11 VN
    const rows = [
      mv({
        seq: 1,
        kind: "use",
        qty: 1,
        id: "old",
        created_at: "2026-11-17T16:00:00Z",
      }), // 23h 17/11 VN
      mv({
        seq: 2,
        kind: "use",
        qty: 2,
        id: "a",
        created_at: "2026-11-17T17:30:00Z",
      }), // 0h30 18/11 VN
      mv({
        seq: 3,
        kind: "use",
        qty: 3,
        id: "b",
        created_at: "2026-11-18T01:00:00Z",
      }),
      mv({
        seq: 4,
        kind: "void",
        voids_id: "b",
        created_at: "2026-11-18T02:00:00Z",
      }),
    ];
    expect(todaysUses(rows, now).map((m) => m.id)).toEqual(["a"]);
  });

  it("usageCounts: số lần dùng của người dùng theo món", () => {
    const rows = [
      mv({ seq: 1, kind: "use", qty: 1, item_id: "x" }),
      mv({ seq: 2, kind: "use", qty: 1, item_id: "x" }),
      mv({ seq: 3, kind: "use", qty: 1, item_id: "y" }),
      mv({ seq: 4, kind: "use", qty: 1, item_id: "y", created_by: "user-2" }),
    ];
    const counts = usageCounts(rows, "user-1");
    expect(counts.get("x")).toBe(2);
    expect(counts.get("y")).toBe(1);
  });

  it("usageCounts bỏ Ghi dùng đã hủy", () => {
    const rows = [
      mv({ seq: 1, kind: "use", qty: 1, item_id: "x", id: "u1" }),
      mv({ seq: 2, kind: "void", voids_id: "u1", item_id: "x" }),
    ];
    expect(usageCounts(rows, "user-1").get("x")).toBeUndefined();
  });

  it("hủy sau Kiểm kho: tổng giữ theo Kiểm kho (shortcut đã ghi)", () => {
    const lots = stockLots([
      mv({ seq: 1, kind: "count", qty: 10 }),
      mv({ seq: 2, kind: "use", qty: 4, id: "u1" }),
      mv({ seq: 3, kind: "count", qty: 6 }),
      mv({ seq: 4, kind: "void", voids_id: "u1" }),
    ]);
    expect(totalQty(lots)).toBe(6);
  });
});

describe("lastUseToday", () => {
  const now = "2026-11-18T03:00:00Z"; // 10h sáng 18/11 VN
  const today = "2026-11-18T01:00:00Z";

  it("lấy Ghi dùng mới nhất hôm nay của đúng người và đúng món", () => {
    const rows = [
      mv({ seq: 1, kind: "use", qty: 1, id: "a", created_at: today }),
      mv({ seq: 2, kind: "use", qty: 1, id: "b", created_at: today }),
      mv({
        seq: 3,
        kind: "use",
        qty: 1,
        id: "c",
        created_at: today,
        created_by: "user-2",
      }),
      mv({
        seq: 4,
        kind: "use",
        qty: 1,
        id: "d",
        created_at: today,
        item_id: "item-2",
      }),
    ];
    expect(lastUseToday(rows, now, "user-1", "item-1")?.id).toBe("b");
  });

  it("bỏ dòng đã hủy và dòng của ngày trước; không có thì null", () => {
    const rows = [
      mv({ seq: 1, kind: "use", qty: 1, id: "a", created_at: today }),
      mv({ seq: 2, kind: "void", voids_id: "a", created_at: today }),
      mv({
        seq: 3,
        kind: "use",
        qty: 1,
        id: "old",
        created_at: "2026-11-17T01:00:00Z",
      }),
    ];
    expect(lastUseToday(rows, now, "user-1", "item-1")).toBeNull();
  });
});
