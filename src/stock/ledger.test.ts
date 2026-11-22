import { describe, expect, it } from "vitest";
import {
  checkedSince,
  checkResetAt,
  countDiffs,
  countTimes,
  localDate,
  rollbackBatches,
  rollbackPreview,
  stockByItem,
  stockLots,
  todaysUses,
  totalQty,
  usageCounts,
  type Movement,
} from "./ledger";

function mv(
  overrides: Partial<Movement> &
    Pick<Movement, "seq" | "kind"> & { note?: string | null }
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
    note: null,
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

  it("bỏ qua Kiểm kho, Thêm Ngày sản xuất và Ghi dùng đã bị hủy (void)", () => {
    const lots = stockLots([
      mv({ seq: 1, item_id: "item-a", kind: "count", qty: 10, id: "c1" }),
      mv({ seq: 2, item_id: "item-a", kind: "count", qty: 99, id: "c2" }),
      mv({
        seq: 3,
        item_id: "item-a",
        kind: "void",
        voids_id: "c2",
        note: "rollback",
        batch_id: "rb-1",
      }),
      mv({
        seq: 4,
        item_id: "item-a",
        kind: "assign_mfg",
        qty: 4,
        mfg_date: "2026-10-01",
        id: "m1",
      }),
      mv({
        seq: 5,
        item_id: "item-a",
        kind: "void",
        voids_id: "m1",
        note: "rollback",
        batch_id: "rb-1",
      }),
      mv({ seq: 6, item_id: "item-a", kind: "use", qty: 3, id: "u1" }),
      mv({
        seq: 7,
        item_id: "item-a",
        kind: "void",
        voids_id: "u1",
        note: "rollback",
        batch_id: "rb-1",
      }),
    ]);

    expect(lots).toEqual([{ mfgDate: null, qty: 10, enteredOn: "2026-11-17" }]);
    expect(totalQty(lots)).toBe(10);
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

  it("bỏ qua dòng Kiểm kho đã bị hủy", () => {
    const diffs = countDiffs(
      [
        mv({
          seq: 1,
          item_id: "item-a",
          kind: "count",
          qty: 10,
          expected_qty: 8,
          batch_id: "b1",
          id: "c1",
        }),
        mv({
          seq: 2,
          item_id: "item-b",
          kind: "count",
          qty: 3,
          expected_qty: 5,
          batch_id: "b1",
          id: "c2",
        }),
        mv({
          seq: 3,
          item_id: "item-b",
          kind: "void",
          voids_id: "c2",
          note: "rollback",
          batch_id: "rb-1",
        }),
      ],
      "b1"
    );

    expect(diffs).toEqual([
      { item_id: "item-a", expected: 8, actual: 10, diff: 2 },
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

describe("Nhận hàng (kind receive)", () => {
  it("nhận kèm Ngày sản xuất: thành Lô đúng ngày, cạnh Lô đã có", () => {
    const lots = stockLots([
      mv({ seq: 1, kind: "count", qty: 4 }),
      mv({ seq: 2, kind: "receive", qty: 10, mfg_date: "2026-11-10" }),
    ]);
    expect(lots).toEqual([
      { mfgDate: "2026-11-10", qty: 10 },
      { mfgDate: null, qty: 4, enteredOn: "2026-11-17" },
    ]);
  });

  it("nhận không kèm ngày (món không theo dõi): vào phần chưa có ngày theo ngày vào kho", () => {
    const lots = stockLots([
      mv({
        seq: 1,
        kind: "receive",
        qty: 6,
        created_at: "2026-11-18T03:00:00Z",
      }),
    ]);
    expect(lots).toEqual([{ mfgDate: null, qty: 6, enteredOn: "2026-11-18" }]);
  });

  it("Ghi dùng sau khi nhận trừ Lô Ngày sản xuất sớm nhất trước", () => {
    const lots = stockLots([
      mv({ seq: 1, kind: "receive", qty: 5, mfg_date: "2026-11-12" }),
      mv({ seq: 2, kind: "receive", qty: 5, mfg_date: "2026-11-05" }),
      mv({ seq: 3, kind: "use", qty: 7 }),
    ]);
    expect(lots).toEqual([{ mfgDate: "2026-11-12", qty: 3 }]);
  });

  it("Trả hàng hư trừ đúng Lô Ngày sản xuất đã chọn, không đụng Lô khác", () => {
    const lots = stockLots([
      mv({ seq: 1, kind: "receive", qty: 5, mfg_date: "2026-11-05" }),
      mv({ seq: 2, kind: "receive", qty: 5, mfg_date: "2026-11-12" }),
      mv({ seq: 3, kind: "return_damaged", qty: 2, mfg_date: "2026-11-12" }),
    ]);
    expect(lots).toEqual([
      { mfgDate: "2026-11-05", qty: 5 },
      { mfgDate: "2026-11-12", qty: 3 },
    ]);
  });

  it("Trả hàng hư trừ đúng Lô chưa có ngày theo ngày vào kho; hết thì bỏ Lô", () => {
    const lots = stockLots([
      mv({ seq: 1, kind: "count", qty: 4, created_at: "2026-11-10T03:00:00Z" }),
      mv({
        seq: 2,
        kind: "receive",
        qty: 3,
        created_at: "2026-11-12T03:00:00Z",
      }),
      mv({ seq: 3, kind: "return_damaged", qty: 3, entered_on: "2026-11-12" }),
    ]);
    expect(lots).toEqual([{ mfgDate: null, qty: 4, enteredOn: "2026-11-10" }]);
  });
});

describe("checkResetAt: mốc reset nhãn Chưa kiểm là 7h sáng giờ Việt Nam", () => {
  it("sau 7h sáng: mốc là 7h sáng hôm nay", () => {
    expect(checkResetAt("2026-11-19T03:00:00Z")).toBe(
      "2026-11-19T00:00:00.000Z"
    ); // 10h VN
    expect(checkResetAt("2026-11-19T00:00:00Z")).toBe(
      "2026-11-19T00:00:00.000Z"
    ); // đúng 7h VN
  });
  it("trước 7h sáng (kể cả quá nửa đêm): vẫn là mốc 7h sáng hôm qua", () => {
    expect(checkResetAt("2026-11-18T23:59:00Z")).toBe(
      "2026-11-18T00:00:00.000Z"
    ); // 6h59 VN ngày 19
    expect(checkResetAt("2026-11-18T18:00:00Z")).toBe(
      "2026-11-18T00:00:00.000Z"
    ); // 1h VN ngày 19
  });
});

describe("checkedSince: món đã Kiểm kho kể từ mốc reset", () => {
  const now = "2026-11-19T10:00:00Z"; // 17h VN, mốc reset 2026-11-19T00:00Z
  it("chỉ Kiểm kho (count) sau mốc mới tính là đã kiểm", () => {
    const r = checkedSince(
      [
        mv({
          seq: 1,
          kind: "count",
          item_id: "a",
          qty: 3,
          created_at: "2026-11-19T01:00:00Z",
        }),
        mv({
          seq: 2,
          kind: "count",
          item_id: "b",
          qty: 3,
          created_at: "2026-11-18T23:00:00Z",
        }),
      ],
      now
    );
    expect([...r]).toEqual(["a"]);
  });
  it("Ghi dùng, Điều chỉnh, Nhận hàng không làm món thành đã kiểm", () => {
    const r = checkedSince(
      [
        mv({
          seq: 1,
          kind: "use",
          item_id: "a",
          qty: 1,
          created_at: "2026-11-19T02:00:00Z",
        }),
        mv({
          seq: 2,
          kind: "adjust",
          item_id: "b",
          qty: 5,
          created_at: "2026-11-19T02:00:00Z",
        }),
        mv({
          seq: 3,
          kind: "receive",
          item_id: "c",
          qty: 5,
          created_at: "2026-11-19T02:00:00Z",
        }),
      ],
      now
    );
    expect(r.size).toBe(0);
  });
  it("sau Ghi dùng món vẫn giữ trạng thái đã kiểm của lần Kiểm kho trước đó", () => {
    const r = checkedSince(
      [
        mv({
          seq: 1,
          kind: "count",
          item_id: "a",
          qty: 3,
          created_at: "2026-11-19T01:00:00Z",
        }),
        mv({
          seq: 2,
          kind: "use",
          item_id: "a",
          qty: 1,
          created_at: "2026-11-19T03:00:00Z",
        }),
      ],
      now
    );
    expect(r.has("a")).toBe(true);
  });
  it("bỏ qua Kiểm kho đã bị hủy", () => {
    const r = checkedSince(
      [
        mv({
          seq: 1,
          kind: "count",
          item_id: "item-a",
          qty: 3,
          id: "c1",
          created_at: "2026-11-19T01:00:00Z",
        }),
        mv({
          seq: 2,
          kind: "count",
          item_id: "item-b",
          qty: 5,
          id: "c2",
          created_at: "2026-11-19T02:00:00Z",
        }),
        mv({
          seq: 3,
          kind: "void",
          item_id: "item-b",
          voids_id: "c2",
          note: "rollback",
          created_at: "2026-11-19T03:00:00Z",
        }),
      ],
      now
    );
    expect([...r]).toEqual(["item-a"]);
  });
});

describe("countTimes", () => {
  it("chỉ lấy thời điểm của các dòng Kiểm kho chưa bị hủy", () => {
    const times = countTimes([
      mv({
        seq: 1,
        item_id: "item-a",
        kind: "count",
        qty: 5,
        id: "c1",
        created_at: "2026-11-17T01:00:00Z",
      }),
      mv({
        seq: 2,
        item_id: "item-a",
        kind: "use",
        qty: 1,
        id: "u1",
        created_at: "2026-11-17T02:00:00Z",
      }),
      mv({
        seq: 3,
        item_id: "item-a",
        kind: "count",
        qty: 4,
        id: "c2",
        created_at: "2026-11-18T01:00:00Z",
      }),
      mv({
        seq: 4,
        item_id: "item-a",
        kind: "void",
        voids_id: "c2",
        note: "rollback",
        created_at: "2026-11-18T02:00:00Z",
      }),
    ]);

    expect(times).toEqual(["2026-11-17T01:00:00Z"]);
  });
});

describe("rollbackBatches & rollbackPreview", () => {
  it("rollbackBatches gom theo batch_id và xếp đợt mới nhất lên đầu", () => {
    const batches = rollbackBatches([
      mv({
        seq: 1,
        item_id: "item-a",
        kind: "void",
        note: "rollback",
        batch_id: "batch-1",
        voids_id: "c1",
        created_at: "2026-11-18T01:00:00Z",
      }),
      mv({
        seq: 2,
        item_id: "item-a",
        kind: "void",
        note: "rollback",
        batch_id: "batch-1",
        voids_id: "c2",
        created_at: "2026-11-18T01:00:05Z",
      }),
      mv({
        seq: 3,
        item_id: "item-a",
        kind: "void",
        note: null,
        batch_id: null,
        voids_id: "u1",
        created_at: "2026-11-18T02:00:00Z",
      }),
      mv({
        seq: 4,
        item_id: "item-a",
        kind: "void",
        note: "rollback",
        batch_id: "batch-2",
        voids_id: "c3",
        created_at: "2026-11-19T04:00:00Z",
      }),
    ]);

    expect(batches).toEqual([
      { batchId: "batch-2", at: "2026-11-19T04:00:00Z", count: 1 },
      { batchId: "batch-1", at: "2026-11-18T01:00:05Z", count: 2 },
    ]);
  });

  it("rollbackPreview chỉ đếm dòng hợp lệ (bỏ dòng void, đã bị hủy, trước mốc, khác người tạo)", () => {
    const since = "2026-11-18T05:00:00Z";
    const rows: Movement[] = [
      mv({
        seq: 1,
        item_id: "item-a",
        kind: "count",
        qty: 10,
        created_by: "user-a",
        created_at: "2026-11-18T04:59:59Z",
      }),
      mv({
        seq: 2,
        item_id: "item-a",
        kind: "count",
        qty: 12,
        created_by: "user-a",
        created_at: "2026-11-18T05:00:00Z",
      }),
      mv({
        seq: 3,
        item_id: "item-a",
        kind: "adjust",
        qty: 15,
        created_by: "user-a",
        created_at: "2026-11-18T06:00:00Z",
      }),
      mv({
        seq: 4,
        item_id: "item-a",
        kind: "assign_mfg",
        qty: 5,
        mfg_date: "2026-11-01",
        created_by: "user-a",
        created_at: "2026-11-18T07:00:00Z",
      }),
      mv({
        seq: 5,
        item_id: "item-a",
        kind: "use",
        qty: 2,
        created_by: "user-b",
        created_at: "2026-11-18T08:00:00Z",
      }),
      mv({
        seq: 6,
        item_id: "item-a",
        kind: "use",
        qty: 1,
        id: "u-voided",
        created_by: "user-a",
        created_at: "2026-11-18T09:00:00Z",
      }),
      mv({
        seq: 7,
        item_id: "item-a",
        kind: "void",
        voids_id: "u-voided",
        created_by: "user-a",
        created_at: "2026-11-18T10:00:00Z",
      }),
      mv({
        seq: 8,
        item_id: "item-a",
        kind: "receive",
        qty: 4,
        created_by: "user-a",
        created_at: "2026-11-18T11:00:00Z",
      }),
    ];

    expect(rollbackPreview(rows, since, null)).toBe(4);
    expect(rollbackPreview(rows, since, "user-a")).toBe(3);
    expect(rollbackPreview(rows, since, "user-b")).toBe(1);
  });
});
