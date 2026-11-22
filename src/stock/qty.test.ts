import { describe, expect, it } from "vitest";
import {
  formatItemQty,
  formatQty,
  formatSheetQty,
  parseAdjust,
  parseQty,
} from "./qty";

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
    // Viết như tờ giấy: "N(k:P%)" = N hộp, trong đó k hộp còn P%, còn lại nguyên; bỏ "k:" thì k = 1.
    // "1(90%)" = 0,9; "2(1:90%)" = "2(90%)" = 1,9; "3(2:50%)" = 1 + 2×0,5 = 2.
    expect(parseQty("2(1:90%)", { caseSize: null, byPercent: true })).toEqual({
      ok: true,
      value: 1.9,
    });
    expect(parseQty("3(2:50%)", { caseSize: null, byPercent: true })).toEqual({
      ok: true,
      value: 2,
    });
    expect(parseQty("2(3:90%)", { caseSize: null, byPercent: true })).toEqual({
      ok: false,
      error: "Số lượng không hợp lệ",
    });
    // Phần trăm còn lại không quá 100.
    expect(parseQty("1(150%)", { caseSize: null, byPercent: true })).toEqual({
      ok: false,
      error: "Số lượng không hợp lệ",
    });
    expect(parseQty("1(100%)", { caseSize: null, byPercent: true })).toEqual({
      ok: true,
      value: 1,
    });
    expect(parseQty("1(90%)", { caseSize: null, byPercent: true })).toEqual({
      ok: true,
      value: 0.9,
    });
    expect(parseQty("2(90%)", { caseSize: null, byPercent: true })).toEqual({
      ok: true,
      value: 1.9,
    });
    expect(parseQty("1(90%)", { caseSize: null, byPercent: false })).toEqual({
      ok: false,
      error: "Chỉ món Ghi theo % mới gõ được %",
    });
    expect(parseQty("0(90%)", { caseSize: null, byPercent: true })).toEqual({
      ok: false,
      error: "Số lượng không hợp lệ",
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
    ).toBe("3(1:95%)");
    expect(
      formatQty(0.95, { caseSize: null, unit: "Hộp", byPercent: true })
    ).toBe("1(95%)");
    expect(formatQty(0, { caseSize: 12, unit: "Hộp", byPercent: false })).toBe(
      "0 hộp"
    );
    expect(
      formatQty(15, { caseSize: null, unit: "Hộp", byPercent: false })
    ).toBe("15 hộp");
  });

  it("món đơn vị là thùng (1 thùng = 1 thùng): in số thập phân, không lặp 'thùng thùng'", () => {
    const o = { caseSize: 1, unit: "Thùng", byPercent: false };
    expect(formatQty(1.5, o)).toBe("1,5 thùng");
    expect(formatQty(2, o)).toBe("2 thùng");
    expect(formatQty(0.5, o)).toBe("0,5 thùng");
    // Đơn vị là thùng mà Quy cách thùng khác 1 cũng không tách "thùng" + phần dư cùng tên.
    expect(formatQty(15, { ...o, caseSize: 12 })).toBe("15 thùng");
    // Quy cách 1 với đơn vị khác: 1 thùng = 1 đơn vị, tách ra chỉ thừa chữ.
    expect(formatQty(2.5, { ...o, unit: "Hộp" })).toBe("2,5 hộp");
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

describe("parseAdjust", () => {
  const box = { caseSize: 12, byPercent: false };

  it("số không dấu = Tồn kho thực tế mới", () => {
    expect(parseAdjust("15", 19, box)).toEqual({ ok: true, value: 15 });
    expect(parseAdjust("1T+3", 0, box)).toEqual({ ok: true, value: 15 });
  });

  it("+ / - cộng trừ vào số hiện có", () => {
    expect(parseAdjust("+1", 19, box)).toEqual({ ok: true, value: 20 });
    expect(parseAdjust("-1", 19, box)).toEqual({ ok: true, value: 18 });
    expect(parseAdjust("−1T", 19, box)).toEqual({ ok: true, value: 7 });
    expect(parseAdjust("+1T+2", 3, box)).toEqual({ ok: true, value: 17 });
    expect(parseAdjust("-50%", 2, { caseSize: null, byPercent: true })).toEqual(
      { ok: true, value: 1.5 }
    );
  });

  it("trừ quá số đang có thì báo lỗi", () => {
    expect(parseAdjust("-20", 19, box)).toEqual({
      ok: false,
      error: "Không đủ để trừ",
    });
  });

  it("lỗi cú pháp giữ thông báo của parseQty", () => {
    expect(parseAdjust("+", 19, box).ok).toBe(false);
    expect(parseAdjust("-abc", 19, box)).toEqual({
      ok: false,
      error: "Số lượng không hợp lệ",
    });
  });
});

describe("formatSheetQty (số viết kiểu tờ giấy)", () => {
  const box = { caseSize: 12, byPercent: false };

  it("thùng + lẻ: 1T+3, tròn thùng: 2T, nhỏ hơn thùng: số thường", () => {
    expect(formatSheetQty(15, box)).toBe("1T+3");
    expect(formatSheetQty(24, box)).toBe("2T");
    expect(formatSheetQty(7, box)).toBe("7");
  });

  it("món không có Quy cách thùng: số thường, dấu phẩy thập phân", () => {
    expect(formatSheetQty(40, { caseSize: null, byPercent: false })).toBe("40");
    expect(formatSheetQty(0.5, { caseSize: null, byPercent: false })).toBe(
      "0,5"
    );
  });

  it("Ghi theo %: phần lẻ viết bằng %", () => {
    // Có hộp nguyên + 1 hộp lẻ: "N(1:P%)" (N hộp, 1 hộp còn P%): 1,9 → "2(1:90%)", 2,95 → "3(1:95%)".
    expect(formatSheetQty(1.9, { caseSize: null, byPercent: true })).toBe(
      "2(1:90%)"
    );
    expect(formatSheetQty(2.95, { caseSize: null, byPercent: true })).toBe(
      "3(1:95%)"
    );
    expect(
      parseQty(formatSheetQty(1.9, { caseSize: null, byPercent: true }), {
        caseSize: null,
        byPercent: true,
      })
    ).toEqual({ ok: true, value: 1.9 });
    // Chưa đủ 1 hộp: viết như tờ giấy "1(95%)" (1 hộp còn 95%); khứ hồi với parseQty.
    expect(formatSheetQty(0.95, { caseSize: null, byPercent: true })).toBe(
      "1(95%)"
    );
    expect(
      parseQty(formatSheetQty(0.9, { caseSize: null, byPercent: true }), {
        caseSize: null,
        byPercent: true,
      })
    ).toEqual({ ok: true, value: 0.9 });
  });

  it("khứ hồi với parseQty", () => {
    for (const q of [15, 24, 7, 1]) {
      const r = parseQty(formatSheetQty(q, box), box);
      expect(r).toEqual({ ok: true, value: q });
    }
  });
});

describe("formatItemQty", () => {
  it("in theo quy cách của món", () => {
    expect(
      formatItemQty(
        { case_size: 12, unit: "Hộp", record_by_percent: false },
        15
      )
    ).toBe("1 thùng 3 hộp");
  });
  it("món chưa tải thì in số trần", () => {
    expect(formatItemQty(undefined, 3)).toBe("3 ");
  });
});
