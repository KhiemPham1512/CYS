import { describe, expect, it } from "vitest";
import {
  orderSheetRows,
  rememberOrdererName,
  stockSheetCell,
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

  it("Nhóm không có món nào được đặt vẫn ra bảng đủ dòng, ô trống", () => {
    const rows = orderSheetRows([item("a"), item("b")], new Map());
    expect(rows.map((r) => r.qty)).toEqual(["", ""]);
    expect(rows).toHaveLength(2);
  });
});

describe("stockSheetCell", () => {
  const base = { caseSize: null, byPercent: false, trackMfg: false };

  it("có hàng đang về: <đang về>+<tồn>", () => {
    expect(
      stockSheetCell({ ...base, incoming: 5, actual: 23, lastMfg: null })
    ).toBe("5+23");
  });
  it("không có hàng đang về: chỉ tồn thực tế", () => {
    expect(
      stockSheetCell({ ...base, incoming: 0, actual: 23, lastMfg: null })
    ).toBe("23");
  });
  it("thùng và phần trăm theo kiểu tờ giấy", () => {
    expect(
      stockSheetCell({
        caseSize: 500,
        byPercent: false,
        trackMfg: false,
        incoming: 1000,
        actual: 523,
        lastMfg: null,
      })
    ).toBe("2T+1T+23");
    expect(
      stockSheetCell({
        caseSize: null,
        byPercent: true,
        trackMfg: false,
        incoming: 0,
        actual: 0.95,
        lastMfg: null,
      })
    ).toBe("95%");
  });
  it("món theo dõi hạn: thêm (ngày Ngày sản xuất gần nhất); món không theo dõi thì không", () => {
    const mfg = { ...base, incoming: 0, actual: 3, lastMfg: "2026-11-10" };
    expect(stockSheetCell({ ...mfg, trackMfg: true })).toBe("3(10/11)");
    expect(stockSheetCell({ ...mfg, trackMfg: false })).toBe("3");
  });
  it("món theo dõi hạn nhưng chưa có ngày: không thêm ngoặc", () => {
    expect(
      stockSheetCell({
        ...base,
        trackMfg: true,
        incoming: 0,
        actual: 3,
        lastMfg: null,
      })
    ).toBe("3");
  });
  it("hết sạch: 0", () => {
    expect(
      stockSheetCell({ ...base, incoming: 0, actual: 0, lastMfg: null })
    ).toBe("0");
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
