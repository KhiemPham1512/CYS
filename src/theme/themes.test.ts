import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, PALETTES, parseTheme, type Palette } from "./themes";

// Độ tương phản theo WCAG 2.x (công thức chuẩn, tính độc lập với code).
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("chọn chủ đề", () => {
  it("mặc định là Hồng nơ khi chưa lưu gì", () => {
    expect(DEFAULT_THEME).toBe("pink");
    expect(parseTheme(null)).toBe("pink");
  });

  it("đọc lại lựa chọn đã lưu", () => {
    expect(parseTheme("blue")).toBe("blue");
    expect(parseTheme("pink")).toBe("pink");
  });

  it("giá trị lạ hoặc hỏng thì về mặc định", () => {
    expect(parseTheme("")).toBe("pink");
    expect(parseTheme("dark")).toBe("pink");
    expect(parseTheme("{}")).toBe("pink");
  });
});

describe.each(["pink", "blue"] as const)("bảng màu %s", (name) => {
  const p: Palette = PALETTES[name];
  const keys = Object.keys(PALETTES.pink).sort();

  it("đủ khóa màu như chủ đề kia, đều là mã #RRGGBB", () => {
    expect(Object.keys(p).sort()).toEqual(keys);
    for (const v of Object.values(p)) expect(v).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("chữ đọc được: tương phản ≥ 4,5 trên nền trang và thẻ", () => {
    for (const bg of [p.bg, p.surface]) {
      expect(contrast(p.ink, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.muted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("chữ phụ vẫn đọc được trên nền nhạt của điểm nhấn (hàng nhóm, huy hiệu)", () => {
    expect(contrast(p.muted, p.accentSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.ink, p.accentSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it("chữ trên nút và nhãn trạng thái đọc được", () => {
    expect(contrast(p.onAccent, p.accentDeep)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.accentDeep, p.accentSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.amber, p.amberSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.red, p.redSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.green, p.greenSoft)).toBeGreaterThanOrEqual(4.5);
  });
});
