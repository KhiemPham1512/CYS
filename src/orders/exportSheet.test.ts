import { describe, expect, it } from "vitest";
import {
  buildSheetModel,
  orderSheetRows,
  rememberOrdererName,
  sheetStrings,
  stockSheetCell,
  type ModelItem,
  type SheetItem,
} from "./exportSheet";

const item = (id: string, over: Partial<SheetItem> = {}): SheetItem => ({
  id,
  name: `Món ${id}`,
  name_zh: null,
  unit: "Hộp",
  case_size: null,
  record_by_percent: false,
  track_mfg_date: false,
  ...over,
});

describe("orderSheetRows", () => {
  it("đủ mọi món theo thứ tự, STT từ 1, món không đặt để trống", () => {
    const rows = orderSheetRows(
      [item("a", { name_zh: "甲" }), item("b", { case_size: 500 })],
      new Map([["b", 1000]])
    );
    expect(rows).toEqual([
      { stt: 1, name: "Món a", name_zh: "甲", unit: "Hộp", qty: "" },
      { stt: 2, name: "Món b", name_zh: null, unit: "Hộp", qty: "2T" },
    ]);
  });

  it("món có số 0 cũng để trống, không ghi 0", () => {
    const rows = orderSheetRows([item("a")], new Map([["a", 0]]));
    expect(rows[0].qty).toBe("");
  });
  it("Nhóm không có món nào được đặt vẫn ra bảng đủ dòng, ô trống", () => {
    const rows = orderSheetRows([item("a"), item("b")], new Map());
    expect(rows.map((r) => r.qty)).toEqual(["", ""]);
    expect(rows).toHaveLength(2);
  });
});

describe("stockSheetCell (đúng cách viết trên tờ giấy)", () => {
  const base = {
    caseSize: null,
    byPercent: false,
    trackMfg: false,
    incoming: 0,
    lots: [],
  };
  const lot = (qty: number, mfgDate: string | null = null) => ({
    qty,
    mfgDate,
  });

  it("món không theo dõi hạn: <đang về>+<tồn> như tờ giấy (12+2)", () => {
    expect(stockSheetCell({ ...base, incoming: 12, lots: [lot(2)] })).toBe(
      "12+2"
    );
    expect(stockSheetCell({ ...base, incoming: 0, lots: [lot(23)] })).toBe(
      "23"
    );
    expect(stockSheetCell({ ...base, incoming: 5, lots: [] })).toBe("5");
  });
  it("thùng và phần trăm theo kiểu tờ giấy", () => {
    expect(
      stockSheetCell({
        ...base,
        caseSize: 500,
        incoming: 1000,
        lots: [lot(523)],
      })
    ).toBe("2T+1T+23");
    expect(
      stockSheetCell({ ...base, byPercent: true, lots: [lot(0.95)] })
    ).toBe("1(95%)");
  });
  it("món theo dõi hạn: hàng đang về chưa có ngày ghi (), mỗi lô ghi riêng, cách bằng dấu cách: 6() 4(21)", () => {
    const t = { ...base, trackMfg: true };
    expect(
      stockSheetCell({ ...t, incoming: 6, lots: [lot(4, "2026-11-21")] })
    ).toBe("6() 4(21)");
  });
  it("nhiều lô: ngày sản xuất cũ trước, mỗi lô một cụm số(ngày): 3(2) 3(3)", () => {
    const t = { ...base, trackMfg: true };
    expect(
      stockSheetCell({
        ...t,
        lots: [lot(3, "2026-11-03"), lot(3, "2026-11-02")],
      })
    ).toBe("3(2) 3(3)");
    expect(
      stockSheetCell({
        ...t,
        incoming: 1,
        lots: [lot(1, "2026-10-28"), lot(1, "2026-11-20")],
      })
    ).toBe("1() 1(28) 1(20)");
  });
  it("món theo dõi hạn: chỉ có hàng đang về thì ghi 1()", () => {
    expect(
      stockSheetCell({ ...base, trackMfg: true, incoming: 1, lots: [] })
    ).toBe("1()");
  });
  it("tồn chưa có ngày sản xuất của món theo dõi hạn: ghi n()", () => {
    expect(stockSheetCell({ ...base, trackMfg: true, lots: [lot(2)] })).toBe(
      "2()"
    );
  });
  it("hết sạch: 0", () => {
    expect(stockSheetCell({ ...base })).toBe("0");
    expect(stockSheetCell({ ...base, trackMfg: true })).toBe("0");
  });
  it("món/Nhóm có cờ để trống: hết sạch thì ô trống", () => {
    expect(stockSheetCell({ ...base, blankZero: true })).toBe("");
    expect(stockSheetCell({ ...base, blankZero: true, incoming: 4 })).toBe("4");
    expect(stockSheetCell({ ...base, blankZero: true, lots: [lot(2)] })).toBe(
      "2"
    );
  });
});

describe("buildSheetModel (tờ giấy giống mẫu)", () => {
  // Dữ liệu chung chung, không phải dữ liệu thật của quán.
  const mi = (id: string, over: Partial<ModelItem> = {}): ModelItem => ({
    id,
    name: `Món ${id}`,
    unit: "Hộp",
    sheet: {},
    ...over,
  });
  const branch = {
    name: "Chi nhánh X",
    sheet: { title: "CN X", order_zh: "（訂單）", stock_zh: "（庫存）" },
  };
  const group = { name: "Nhóm", name_zh: "組", sheet: {} };
  const base = {
    kind: "order" as const,
    branch,
    group,
    items: [mi("a"), mi("b")],
    qtyByItem: new Map<string, string>(),
  };

  it("tiêu đề theo loại tờ, tên in và phần chữ Trung lấy từ Chi nhánh", () => {
    const order = buildSheetModel(base);
    expect(order.title).toBe("ĐẶT HÀNG - CN X");
    expect(order.titleZh).toBe("（訂單）");
    const stock = buildSheetModel({ ...base, kind: "stock" });
    expect(stock.title).toBe("TỒN KHO MỖI NGÀY - CN X");
    expect(stock.titleZh).toBe("（庫存）");
  });

  it("qty_suffix: ô số lượng của món in kèm chữ như viết tay (1 Sấp); ô trống hoặc 0 thì để nguyên", () => {
    const m = buildSheetModel({
      ...base,
      items: [
        mi("a", { sheet: { qty_suffix: "Sấp" } }),
        mi("b", { sheet: { qty_suffix: "Sấp" } }),
        mi("c", { sheet: { qty_suffix: "Sấp" } }),
        mi("d"),
      ],
      qtyByItem: new Map([
        ["a", "1"],
        ["b", ""],
        ["c", "0"],
        ["d", "2"],
      ]),
    });
    expect(m.rows.map((r) => r.qty)).toEqual(["1 Sấp", "", "0", "2"]);
  });

  it("chưa có tên in thì dùng tên Chi nhánh viết hoa", () => {
    const m = buildSheetModel({
      ...base,
      branch: { name: "Chi nhánh x", sheet: {} },
    });
    expect(m.title).toBe("ĐẶT HÀNG - CHI NHÁNH X");
    expect(m.titleZh).toBe("");
  });

  it("dòng bảng: STT từ 1, tên và đơn vị in trên tờ thay tên/đơn vị trong app, kèm chữ Trung, ghi chú và số lượng", () => {
    const m = buildSheetModel({
      ...base,
      items: [
        mi("a", {
          sheet: {
            name: "Tên in",
            zh: "（中）",
            note: "1 thùng / 10",
            unit: "Thùng",
            unit_zh: "桶",
          },
        }),
        mi("b"),
      ],
      qtyByItem: new Map([["a", "2T"]]),
    });
    expect(m.rows).toEqual([
      {
        stt: 1,
        name: "Tên in",
        zh: "（中）",
        note: "1 thùng / 10",
        unit: "Thùng",
        unitZh: "桶",
        qty: "2T",
      },
      {
        stt: 2,
        name: "Món b",
        zh: "",
        note: "",
        unit: "Hộp",
        unitZh: "",
        qty: "",
      },
    ]);
  });

  it("cột LOẠI: các món liền nhau cùng loại gộp một ô, đếm số dòng", () => {
    const cat = (c: string, z: string) => ({ category: c, category_zh: z });
    const m = buildSheetModel({
      ...base,
      items: [
        mi("a", { sheet: cat("A", "甲") }),
        mi("b", { sheet: cat("A", "甲") }),
        mi("c", { sheet: cat("B", "乙") }),
        mi("d", { sheet: cat("A", "甲") }),
      ],
    });
    expect(m.categories).toEqual([
      { label: "A", labelZh: "甲", span: 2 },
      { label: "B", labelZh: "乙", span: 1 },
      { label: "A", labelZh: "甲", span: 1 },
    ]);
  });

  it("món không có loại riêng: dùng tên Nhóm viết hoa và chữ Trung của Nhóm; Nhóm có thể đặt nhãn khác", () => {
    expect(buildSheetModel(base).categories).toEqual([
      { label: "NHÓM", labelZh: "組", span: 2 },
    ]);
    const m = buildSheetModel({
      ...base,
      group: { ...group, sheet: { label: "N.", label_zh: "二" } },
    });
    expect(m.categories).toEqual([{ label: "N.", labelZh: "二", span: 2 }]);
  });

  it("nhãn cột số lượng: mặc định SỐ LƯỢNG, Nhóm có thể đặt SL", () => {
    expect(buildSheetModel(base).qtyLabel).toBe("SỐ LƯỢNG");
    const m = buildSheetModel({
      ...base,
      group: { ...group, sheet: { qty_label: "SL" } },
    });
    expect(m.qtyLabel).toBe("SL");
  });
});

describe("sheetStrings (đọc cột JSON 'in trên tờ')", () => {
  it("chỉ lấy các khóa cho phép có giá trị chuỗi", () => {
    expect(
      sheetStrings({ name: "A", zh: 5, extra: "x", lạ: "y", note: null }, [
        "name",
        "zh",
        "note",
        "extra",
      ])
    ).toEqual({ name: "A", extra: "x" });
  });
  it("chuỗi rỗng coi như chưa đặt (không đè giá trị mặc định)", () => {
    expect(sheetStrings({ name: "", zh: "中" }, ["name", "zh"])).toEqual({
      zh: "中",
    });
  });
  it("giá trị không phải đối tượng thì ra rỗng", () => {
    expect(sheetStrings(null, ["name"])).toEqual({});
    expect(sheetStrings("abc", ["name"])).toEqual({});
    expect(sheetStrings([1], ["name"])).toEqual({});
  });
});

describe("rememberOrdererName", () => {
  it("đưa tên vừa dùng lên đầu, không trùng (không phân biệt hoa thường), bỏ rỗng", () => {
    expect(rememberOrdererName(["An", "Bình"], "  bình ")).toEqual([
      "bình",
      "An",
    ]);
    expect(rememberOrdererName(["An"], "   ")).toEqual(["An"]);
  });
  it("giữ tối đa 8 tên gần nhất", () => {
    const names = ["1", "2", "3", "4", "5", "6", "7", "8"];
    expect(rememberOrdererName(names, "9")).toEqual([
      "9",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
  });
});
