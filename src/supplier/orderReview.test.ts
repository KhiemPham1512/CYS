import { describe, expect, it } from "vitest";
import type { MatchItem, RawLine } from "./orderReconcile";
import { reviewSupplierOrder } from "./orderReview";

const raw = (over: Partial<RawLine>): RawLine => ({
  name: "Mứt Cam - 橙醬",
  qty: 5,
  unit: "Lon",
  pack: null,
  orderCode: "S1",
  ...over,
});
const jam: MatchItem = {
  id: "jam",
  name: "Mứt cam",
  unit: "Lon",
  case_size: 12,
};
const tea: MatchItem = {
  id: "tea",
  name: "Trà đen",
  unit: "Gói",
  case_size: null,
};

describe("reviewSupplierOrder", () => {
  it("hai ảnh chồng nhau không cộng đôi, đúng đơn đã đặt thì ổn", () => {
    const shared = raw({ qty: 5 });
    const r = reviewSupplierOrder({
      images: [
        [shared],
        [shared, raw({ name: "Trà đen", unit: "Gói", qty: 3 })],
      ],
      items: [jam, tea],
      aliases: {},
      ordered: new Map([
        ["jam", 5],
        ["tea", 3],
      ]),
    });
    expect(r.rows.map((x) => [x.itemId, x.supplied, x.status])).toEqual([
      ["jam", 5, "ok"],
      ["tea", 3, "ok"],
    ]);
    expect(r.unknown).toEqual([]);
    expect(r.allOk).toBe(true);
  });

  it("12 hộp theo quy cách thùng quy về lon của món rồi so với đơn", () => {
    const r = reviewSupplierOrder({
      images: [[raw({ qty: 2, unit: "Thùng", pack: "12 lon/thùng" })]],
      items: [jam],
      aliases: {},
      ordered: new Map([["jam", 12]]),
    });
    expect(r.rows).toEqual([
      { itemId: "jam", ordered: 12, supplied: 24, status: "more" },
    ]);
    expect(r.allOk).toBe(false);
  });

  it("tên lạ chưa nhớ thì vào danh sách hỏi, có alias thì tự khớp", () => {
    const strange = raw({ name: "Hàng X - 某", qty: 1 });
    const ask = reviewSupplierOrder({
      images: [[strange]],
      items: [jam],
      aliases: {},
      ordered: new Map(),
    });
    expect(ask.unknown).toEqual([strange]);
    expect(ask.allOk).toBe(false);

    const known = reviewSupplierOrder({
      images: [[strange]],
      items: [jam],
      aliases: { "hang x": "jam" },
      ordered: new Map(),
    });
    expect(known.unknown).toEqual([]);
    expect(known.rows[0]).toMatchObject({ itemId: "jam", supplied: 1 });
  });

  it("đơn vị không quy đổi được thì báo riêng, không đoán số", () => {
    const odd = raw({ qty: 2, unit: "Kiện", pack: null });
    const r = reviewSupplierOrder({
      images: [[odd]],
      items: [jam],
      aliases: {},
      ordered: new Map([["jam", 2]]),
    });
    expect(r.unconvertible).toEqual([{ line: odd, itemId: "jam" }]);
    expect(r.rows).toEqual([
      { itemId: "jam", ordered: 2, supplied: 0, status: "missing" },
    ]);
    expect(r.allOk).toBe(false);
  });

  it("món có trong đơn mà NCC không gửi báo thiếu, món ngoài đơn báo ngoài đơn", () => {
    const r = reviewSupplierOrder({
      images: [[raw({ name: "Trà đen", unit: "Gói", qty: 2 })]],
      items: [jam, tea],
      aliases: {},
      ordered: new Map([["jam", 4]]),
    });
    const by = Object.fromEntries(r.rows.map((x) => [x.itemId, x.status]));
    expect(by).toEqual({ jam: "missing", tea: "extra" });
  });
});
