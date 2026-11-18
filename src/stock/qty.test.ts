import { describe, expect, it } from "vitest";
import { formatQty, parseQty } from "./qty";

describe("parseQty", () => {
  it("đọc các ví dụ hợp lệ trong đặc tả", () => {
    expect(parseQty("1T+3", { caseSize: 12, byPercent: false })).toEqual({
      ok: true,
      value: 15,
    });
    expect(parseQty("1t + 3", { caseSize: 12, byPercent: false })).toEqual({
      ok: true,
      value: 15,
    });
    expect(parseQty("0,5", { caseSize: null, byPercent: false })).toEqual({
      ok: true,
      value: 0.5,
    });
    expect(parseQty("95%", { caseSize: null, byPercent: true })).toEqual({
      ok: true,
      value: 0.95,
    });
    expect(parseQty("2+95%", { caseSize: null, byPercent: true })).toEqual({
      ok: true,
      value: 2.95,
    });
    expect(parseQty("0", { caseSize: 12, byPercent: false })).toEqual({
      ok: true,
      value: 0,
    });
  });

  it("làm tròn 4 chữ số thập phân", () => {
    expect(parseQty("0.1 + 0.2", { caseSize: null, byPercent: false })).toEqual(
      {
        ok: true,
        value: 0.3,
      }
    );
  });

  it("trả lỗi đúng cho các trường hợp không hợp lệ", () => {
    expect(parseQty("", { caseSize: 12, byPercent: false })).toEqual({
      ok: false,
      error: "Chưa nhập",
    });
    expect(parseQty("   ", { caseSize: 12, byPercent: false })).toEqual({
      ok: false,
      error: "Chưa nhập",
    });
    expect(parseQty("1T", { caseSize: null, byPercent: false })).toEqual({
      ok: false,
      error: "Món này chưa có Quy cách thùng",
    });
    expect(parseQty("95%", { caseSize: null, byPercent: false })).toEqual({
      ok: false,
      error: "Chỉ món Ghi theo % mới gõ được %",
    });
    expect(parseQty("1+", { caseSize: 12, byPercent: false })).toEqual({
      ok: false,
      error: "Số lượng không hợp lệ",
    });
    expect(parseQty("abc", { caseSize: 12, byPercent: false })).toEqual({
      ok: false,
      error: "Số lượng không hợp lệ",
    });
    expect(parseQty("-2", { caseSize: 12, byPercent: false })).toEqual({
      ok: false,
      error: "Số lượng không hợp lệ",
    });
  });
});

describe("formatQty", () => {
  it("định dạng đúng các ví dụ trong đặc tả", () => {
    expect(formatQty(15, { caseSize: 12, unit: "Hộp", byPercent: false })).toBe(
      "1 thùng 3 hộp"
    );
    expect(formatQty(24, { caseSize: 12, unit: "Hộp", byPercent: false })).toBe(
      "2 thùng"
    );
    expect(
      formatQty(0.5, { caseSize: 12, unit: "Hộp", byPercent: false })
    ).toBe("0,5 hộp");
    expect(formatQty(3, { caseSize: 12, unit: "Hộp", byPercent: false })).toBe(
      "3 hộp"
    );
    expect(
      formatQty(2.95, { caseSize: null, unit: "Hộp", byPercent: true })
    ).toBe("2 hộp 95%");
    expect(
      formatQty(0.95, { caseSize: null, unit: "Hộp", byPercent: true })
    ).toBe("95%");
    expect(formatQty(0, { caseSize: 12, unit: "Hộp", byPercent: false })).toBe(
      "0 hộp"
    );
    expect(
      formatQty(15, { caseSize: null, unit: "Hộp", byPercent: false })
    ).toBe("15 hộp");
  });

  it("khứ hồi parseQty(formatQty(x)) với món có caseSize cho các giá trị nguyên", () => {
    const caseSize = 12;
    const toInput = (formatted: string): string =>
      formatted
        .replace(/\s*thùng\s*/g, "T+")
        .replace(/\s*hộp/g, "")
        .replace(/\+$/, "");

    for (const x of [0, 1, 5, 12, 15, 24, 37]) {
      const formatted = formatQty(x, {
        caseSize,
        unit: "Hộp",
        byPercent: false,
      });
      const parsed = parseQty(toInput(formatted), {
        caseSize,
        byPercent: false,
      });
      expect(parsed).toEqual({ ok: true, value: x });
    }
  });
});
