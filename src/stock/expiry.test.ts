import { describe, expect, it } from "vitest";
import {
  addDuration,
  autoTracksInUse,
  lastDay,
  expiredLots,
  formatDayMonth,
  formatMfg,
  expiryAlerts,
  inUseExpiry,
  lotExpiry,
  tracksInUse,
  openedByCount,
  usesMfgDate,
  type ExpiryItem,
} from "./expiry";

const item = (
  over: Partial<ExpiryItem & { track_in_use?: boolean | null }> = {}
): ExpiryItem & { track_in_use?: boolean | null } => ({
  shelf_life: null,
  shelf_life_unit: "month",
  shelf_life_from_receipt_days: null,
  shelf_life_after_open: null,
  shelf_life_after_open_unit: "day",
  ...over,
});

describe("addDuration", () => {
  it("cộng ngày", () => {
    expect(addDuration("2026-11-28", 5, "day")).toBe("2026-12-03");
  });
  it("cộng tháng theo lịch, cuối tháng thì lấy ngày cuối của tháng đích", () => {
    expect(addDuration("2026-10-15", 6, "month")).toBe("2027-04-15");
    expect(addDuration("2026-01-31", 1, "month")).toBe("2026-02-28");
    expect(addDuration("2027-12-31", 2, "month")).toBe("2028-02-29");
  });
});

describe("lastDay: hạn tính cả ngày bắt đầu", () => {
  it("30 ngày từ 18/11 dùng được đến 17/12; từ 18/10 đến 16/11", () => {
    expect(lastDay("2026-11-18", 30, "day")).toBe("2026-12-17");
    expect(lastDay("2026-10-18", 30, "day")).toBe("2026-11-16");
  });
  it("1 ngày = chính ngày đó", () => {
    expect(lastDay("2026-11-18", 1, "day")).toBe("2026-11-18");
  });
  it("tháng tính theo lịch, giữ nguyên ngày", () => {
    expect(lastDay("2026-10-15", 6, "month")).toBe("2027-04-15");
  });
});

describe("lotExpiry", () => {
  it("Lô có Ngày sản xuất: Ngày sản xuất + Thời hạn sử dụng", () => {
    expect(
      lotExpiry({ mfgDate: "2026-10-15", qty: 1 }, item({ shelf_life: 6 }))
    ).toBe("2027-04-15");
  });
  it("Lô chưa có ngày: hạn từ ngày vào kho", () => {
    expect(
      lotExpiry(
        { mfgDate: null, qty: 1, enteredOn: "2026-11-10" },
        item({ shelf_life: 6, shelf_life_from_receipt_days: 7 })
      )
    ).toBe("2026-11-16");
  });
  it("có cả hai quy tắc: lấy ngày sớm hơn", () => {
    // Lô có ngày sản xuất + hạn 6 tháng = 2027-04-15, nhưng vào kho 11-10 + 7 ngày (tính cả ngày đầu) = 11-16 sớm hơn
    expect(
      lotExpiry(
        { mfgDate: "2026-10-15", qty: 1, enteredOn: "2026-11-10" },
        item({ shelf_life: 6, shelf_life_from_receipt_days: 7 })
      )
    ).toBe("2026-11-16");
  });
  it("món chưa có Thời hạn sử dụng: không có hạn", () => {
    expect(lotExpiry({ mfgDate: "2026-10-15", qty: 1 }, item())).toBeNull();
    expect(
      lotExpiry(
        { mfgDate: null, qty: 1, enteredOn: "2026-11-10" },
        item({ shelf_life: 6 })
      )
    ).toBeNull();
  });
});

describe("expiryAlerts", () => {
  const e = (id: string, expiry: string) => ({ id, expiry });
  const rows = [
    e("hết hôm qua", "2026-11-17"),
    e("hôm nay", "2026-11-18"),
    e("còn 3 ngày", "2026-11-21"),
    e("còn 4 ngày", "2026-11-22"),
  ];
  it("quá hạn là hạn < hôm nay; sắp hết là 0..ngưỡng ngày, xếp theo hạn", () => {
    const r = expiryAlerts(rows, "2026-11-18", 3);
    expect(r.expired.map((x) => x.id)).toEqual(["hết hôm qua"]);
    expect(r.soon.map((x) => x.id)).toEqual(["hôm nay", "còn 3 ngày"]);
  });
  it("ngưỡng chỉnh được", () => {
    expect(expiryAlerts(rows, "2026-11-18", 4).soon).toHaveLength(3);
    expect(expiryAlerts(rows, "2026-11-18", 0).soon.map((x) => x.id)).toEqual([
      "hôm nay",
    ]);
  });
});

describe("Đang dùng", () => {
  it("chỉ theo dõi khi hạn sau khui > 7 ngày (tháng luôn > 7 ngày)", () => {
    expect(tracksInUse(item())).toBe(false);
    expect(tracksInUse(item({ shelf_life_after_open: 7 }))).toBe(false);
    expect(tracksInUse(item({ shelf_life_after_open: 8 }))).toBe(true);
    expect(
      tracksInUse(
        item({ shelf_life_after_open: 1, shelf_life_after_open_unit: "month" })
      )
    ).toBe(true);
  });
  it("track_in_use ghi đè quy tắc tự động, nhưng không có hạn sau khui thì luôn tắt", () => {
    expect(autoTracksInUse(null, "day")).toBe(false);
    expect(autoTracksInUse(7, "day")).toBe(false);
    expect(autoTracksInUse(8, "day")).toBe(true);
    expect(autoTracksInUse(1, "month")).toBe(true);

    expect(
      tracksInUse(item({ shelf_life_after_open: 30, track_in_use: false }))
    ).toBe(false);
    expect(
      tracksInUse(item({ shelf_life_after_open: 7, track_in_use: true }))
    ).toBe(true);
    expect(
      tracksInUse(item({ shelf_life_after_open: null, track_in_use: true }))
    ).toBe(false);
    expect(
      tracksInUse(item({ shelf_life_after_open: 7, track_in_use: null }))
    ).toBe(false);
    expect(
      tracksInUse(item({ shelf_life_after_open: 8, track_in_use: null }))
    ).toBe(true);
  });
  it("openedByCount tôn trọng track_in_use", () => {
    const map = new Map([
      ["siro", item({ shelf_life_after_open: 30, track_in_use: false })],
      ["sua", item({ shelf_life_after_open: 7, track_in_use: true })],
    ]);
    expect(
      openedByCount(
        [
          { item_id: "siro", qty: 1, expected_qty: 2 },
          { item_id: "sua", qty: 1, expected_qty: 2 },
        ],
        map
      )
    ).toEqual(["sua"]);
  });
  it("dùng được đến = ngày khui + hạn sau khui", () => {
    expect(inUseExpiry("2026-11-18", item({ shelf_life_after_open: 30 }))).toBe(
      "2026-12-17"
    );
    expect(
      inUseExpiry(
        "2026-11-18",
        item({ shelf_life_after_open: 2, shelf_life_after_open_unit: "month" })
      )
    ).toBe("2027-01-18");
    expect(inUseExpiry("2026-11-18", item())).toBeNull();
  });
});

describe("expiredLots: Lô quá hạn của một món (để tô đỏ ở Tồn kho)", () => {
  const sixMonths = item({ shelf_life: 6 });
  it("trả các Lô có hạn trước hôm nay; hạn đúng hôm nay vẫn dùng được", () => {
    const lots = [
      { mfgDate: "2026-05-17", qty: 2 }, // hạn 2026-11-17: quá hạn
      { mfgDate: "2026-05-18", qty: 3 }, // hạn 2026-11-18: hôm nay, chưa quá
    ];
    expect(expiredLots(lots, sixMonths, "2026-11-18")).toEqual([lots[0]]);
  });
  it("món không có Thời hạn: không Lô nào quá hạn", () => {
    expect(
      expiredLots([{ mfgDate: "2020-01-01", qty: 1 }], item(), "2026-11-18")
    ).toEqual([]);
  });
});

describe("usesMfgDate: món nào có Ngày sản xuất trên giao diện", () => {
  it("món theo dõi hoặc có Thời hạn thì có; món không hạn (đóng gói) thì không", () => {
    expect(usesMfgDate({ track_mfg_date: true, shelf_life: null })).toBe(true);
    expect(usesMfgDate({ track_mfg_date: false, shelf_life: 6 })).toBe(true);
    expect(usesMfgDate({ track_mfg_date: false, shelf_life: null })).toBe(
      false
    );
  });
});

describe("formatMfg: Ngày sản xuất viết tắt, chỉ thêm năm khi hạn sang năm khác", () => {
  it("ngày/tháng, bỏ năm", () => {
    expect(formatDayMonth("2026-10-28")).toBe("28/10");
    expect(
      formatMfg("2026-10-28", item({ shelf_life: 2, shelf_life_unit: "month" }))
    ).toBe("28/10");
    expect(formatMfg("2026-10-28", item())).toBe("28/10"); // món chưa có hạn
  });
  it("món hạn dài sang năm sau thì giữ năm", () => {
    expect(
      formatMfg(
        "2026-10-28",
        item({ shelf_life: 12, shelf_life_unit: "month" })
      )
    ).toBe("28/10/2026");
    expect(
      formatMfg(
        "2026-02-01",
        item({ shelf_life: 12, shelf_life_unit: "month" })
      )
    ).toBe("01/02/2026");
    expect(
      formatMfg("2026-10-28", item({ shelf_life: 5, shelf_life_unit: "month" }))
    ).toBe("28/10/2026"); // hạn 28/03/2027
  });
});

describe("openedByCount", () => {
  const tracked = { id: "nho", ...item({ shelf_life_after_open: 30 }) };
  const plain = { id: "da", ...item() };
  const items = new Map([tracked, plain].map((i) => [i.id, i]));

  it("Kiểm kho ít hơn sổ: món theo dõi vào Đang dùng", () => {
    expect(
      openedByCount(
        [
          { item_id: "nho", qty: 1, expected_qty: 2 },
          { item_id: "da", qty: 0, expected_qty: 5 },
        ],
        items
      )
    ).toEqual(["nho"]);
  });
  it("đếm bằng hoặc nhiều hơn sổ thì không", () => {
    expect(
      openedByCount(
        [
          { item_id: "nho", qty: 2, expected_qty: 2 },
          { item_id: "nho", qty: 3, expected_qty: 2 },
        ],
        items
      )
    ).toEqual([]);
  });
  it("món không còn trong Danh mục thì bỏ", () => {
    expect(
      openedByCount([{ item_id: "x", qty: 0, expected_qty: 1 }], items)
    ).toEqual([]);
  });
});
