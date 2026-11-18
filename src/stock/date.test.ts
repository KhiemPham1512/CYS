import { describe, expect, it } from "vitest";
import { formatDate, parseShortDate } from "./date";

describe("parseShortDate", () => {
  const today = new Date(2026, 10, 18); // 2026-11-18 local

  it("xử lý dạng d và d/m và d/m/yy theo ví dụ đặc tả", () => {
    expect(parseShortDate("28", today)).toEqual({
      ok: true,
      value: "2026-10-28",
    });
    expect(parseShortDate("18", today)).toEqual({
      ok: true,
      value: "2026-11-18",
    });
    expect(parseShortDate("5", today)).toEqual({
      ok: true,
      value: "2026-11-05",
    });
    expect(parseShortDate("28/10", today)).toEqual({
      ok: true,
      value: "2026-10-28",
    });
    expect(parseShortDate("28/12", today)).toEqual({
      ok: true,
      value: "2025-12-28",
    });
    expect(parseShortDate("31", today)).toEqual({
      ok: true,
      value: "2026-10-31",
    });
    expect(parseShortDate("28/10/26", today)).toEqual({
      ok: true,
      value: "2026-10-28",
    });
    expect(parseShortDate("28/10/2026", today)).toEqual({
      ok: true,
      value: "2026-10-28",
    });
  });

  it("lùi qua tháng không có ngày đó", () => {
    const march2 = new Date(2026, 2, 2); // 2026-03-02 local
    expect(parseShortDate("30", march2)).toEqual({
      ok: true,
      value: "2026-01-30",
    });
  });

  it("từ chối ngày rỗng, không tồn tại hoặc ở tương lai", () => {
    expect(parseShortDate("", today)).toEqual({
      ok: false,
      error: "Chưa nhập ngày",
    });
    expect(parseShortDate("31/2", today)).toEqual({
      ok: false,
      error: "Ngày không hợp lệ",
    });
    expect(parseShortDate("1/1/2027", today)).toEqual({
      ok: false,
      error: "Ngày sản xuất không thể ở tương lai",
    });
    expect(parseShortDate("abc", today)).toEqual({
      ok: false,
      error: "Ngày không hợp lệ",
    });
  });
});

describe("formatDate", () => {
  it("định dạng yyyy-mm-dd thành dd/mm/yyyy", () => {
    expect(formatDate("2026-10-28")).toBe("28/10/2026");
  });
});
