import { describe, expect, it } from "vitest";
import {
  compareOrders,
  matchSupplierName,
  mergeRawLines,
  parsePack,
  toItemQty,
  type MatchItem,
  type RawLine,
} from "./orderReconcile";

const raw = (over: Partial<RawLine>): RawLine => ({
  name: "Mứt Cam - 橙醬",
  qty: 5,
  unit: "Lon",
  pack: "12 lon/thùng",
  orderCode: "S1",
  ...over,
});

const item = (over: Partial<MatchItem> = {}): MatchItem => ({
  id: "i1",
  name: "Mứt cam",
  unit: "Lon",
  case_size: 12,
  ...over,
});

describe("mergeRawLines (gộp ảnh chồng nhau)", () => {
  it("hai ảnh chồng nhau có cùng dòng thì không cộng đôi", () => {
    const image1 = [raw({ name: "A" }), raw({ name: "B", qty: 2 })];
    const image2 = [raw({ name: "B", qty: 2 }), raw({ name: "C", qty: 1 })];
    const merged = mergeRawLines([image1, image2]);
    expect(merged.map((l) => [l.name, l.qty])).toEqual([
      ["A", 5],
      ["B", 2],
      ["C", 1],
    ]);
  });

  it("cùng món khác số lượng ở hai ảnh giữ cả hai (không đoán)", () => {
    const merged = mergeRawLines([[raw({ qty: 5 })], [raw({ qty: 3 })]]);
    expect(merged).toHaveLength(2);
  });

  it("ảnh sau không thấy mã đơn (chỉ ở đầu ảnh trước) vẫn nhận dòng chồng là cùng đơn", () => {
    const image1 = [raw({ name: "B", qty: 2, orderCode: "S1" })];
    const image2 = [
      raw({ name: "B", qty: 2, orderCode: null }),
      raw({ name: "C", qty: 1, orderCode: null }),
    ];
    const merged = mergeRawLines([image1, image2]);
    expect(merged.map((l) => [l.name, l.orderCode])).toEqual([
      ["B", "S1"],
      ["C", "S1"],
    ]);
  });

  it("khác mã đơn thì là hai dòng khác nhau dù cùng tên và số", () => {
    const merged = mergeRawLines([
      [raw({ orderCode: "S1" })],
      [raw({ orderCode: "S2" })],
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("matchSupplierName", () => {
  const items = [
    item({ id: "mut", name: "Mứt cam" }),
    item({
      id: "kem",
      name: "Kem béo thực vật hiệu X",
      unit: "Hộp",
      case_size: 12,
    }),
    item({ id: "sua", name: "Sữa tươi hiệu Y", unit: "Bình", case_size: 12 }),
  ];

  it("khớp phần tên tiếng Việt, bỏ tên Trung sau dấu '-' và không phân biệt hoa thường/dấu", () => {
    expect(matchSupplierName("MỨT CAM - 橙醬", items, {})).toEqual({
      itemId: "mut",
      via: "exact",
    });
  });

  it("khớp gần đúng khi tên NCC khác cách viết (một món rõ nhất)", () => {
    expect(matchSupplierName("Kem Béo Thực Vật 1Kg - 奶精", items, {})).toEqual(
      { itemId: "kem", via: "fuzzy" }
    );
  });

  it("tên lạ nhớ trước đó thì tự khớp (alias ưu tiên)", () => {
    expect(
      matchSupplierName("Sữa tươi - 鮮奶", items, { "sua tuoi": "sua" })
    ).toEqual({ itemId: "sua", via: "alias" });
  });

  it("tên lạ chưa nhớ thì trả null để hỏi người dùng", () => {
    expect(matchSupplierName("Bột trà ABC - 茶粉", items, {})).toBeNull();
  });
});

describe("parsePack", () => {
  it("'12 lon/thùng' -> 12 lon mỗi thùng (đơn vị chuẩn hóa không dấu); không có số thì null", () => {
    expect(parsePack("12 lon/thùng")).toEqual({
      per: 12,
      inner: "lon",
      outer: "thung",
    });
    expect(parsePack("20BAO/THÙNG")).toEqual({
      per: 20,
      inner: "bao",
      outer: "thung",
    });
    expect(parsePack("2L/BÌNH")).toBeNull();
    expect(parsePack(null)).toBeNull();
  });
});

describe("toItemQty (quy đổi về đơn vị của món)", () => {
  it("cùng đơn vị thì giữ nguyên (12 hộp = 12, hiển thị 1T với quy cách 12)", () => {
    expect(
      toItemQty(
        { qty: 12, unit: "Hộp", pack: "12 hộp/thùng" },
        item({ unit: "Hộp" })
      )
    ).toEqual({ ok: true, qty: 12 });
  });

  it("đơn vị thùng thì nhân theo mô tả quy cách", () => {
    expect(
      toItemQty({ qty: 2, unit: "Thùng", pack: "12 lon/thùng" }, item())
    ).toEqual({ ok: true, qty: 24 });
  });

  it("đơn vị thùng không có mô tả thì dùng Quy cách thùng của món", () => {
    expect(
      toItemQty({ qty: 1, unit: "Thùng", pack: null }, item({ case_size: 12 }))
    ).toEqual({ ok: true, qty: 12 });
  });

  it("không quy đổi được (khác đơn vị, không có quy cách) thì báo lỗi, không đoán", () => {
    expect(
      toItemQty({ qty: 2, unit: "Kg", pack: null }, item({ case_size: null }))
    ).toEqual({ ok: false });
  });
});

describe("compareOrders (so với Đơn đặt hàng)", () => {
  const ordered = new Map([
    ["a", 12],
    ["b", 6],
    ["c", 4],
    ["d", 3],
  ]);
  const supplied = new Map([
    ["a", 12], // đúng
    ["b", 4], // NCC ít hơn
    ["c", 8], // NCC nhiều hơn
    ["z", 2], // ngoài đơn
  ]); // d không có bên NCC

  it("phân loại đúng / thiếu / dư / thiếu món / ngoài đơn", () => {
    const r = compareOrders(ordered, supplied);
    const status = Object.fromEntries(r.rows.map((x) => [x.itemId, x.status]));
    expect(status).toEqual({
      a: "ok",
      b: "less",
      c: "more",
      d: "missing",
      z: "extra",
    });
    expect(r.allOk).toBe(false);
  });

  it("khớp hết thì allOk", () => {
    const r = compareOrders(new Map([["a", 12]]), new Map([["a", 12]]));
    expect(r.allOk).toBe(true);
  });

  it("sai số rất nhỏ do làm tròn vẫn là ok", () => {
    expect(
      compareOrders(new Map([["a", 0.3]]), new Map([["a", 0.30000001]])).allOk
    ).toBe(true);
  });
});
