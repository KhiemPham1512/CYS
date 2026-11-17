import { describe, expect, it } from "vitest";
import { matchesQuery, normalizeVi } from "./search";

describe("normalizeVi", () => {
  it("chuyển chữ thường, bỏ dấu, đ → d, gộp khoảng trắng", () => {
    expect(normalizeVi("  Trà   Sữa  Đường  Đen  ")).toBe("tra sua duong den");
    expect(normalizeVi("ĐÀO NGÂM")).toBe("dao ngam");
  });
});

describe("matchesQuery", () => {
  it("query rỗng luôn khớp", () => {
    expect(matchesQuery({ name: "Trà sữa", name_zh: null }, "")).toBe(true);
    expect(matchesQuery({ name: "Trà sữa", name_zh: null }, "   ")).toBe(true);
  });

  it("khớp không dấu và không phân biệt hoa thường", () => {
    expect(matchesQuery({ name: "Trà sữa", name_zh: null }, "tra sua")).toBe(
      true
    );
    expect(
      matchesQuery({ name: "Trân châu đường đen", name_zh: null }, "DUONG den")
    ).toBe(true);
    expect(matchesQuery({ name: "Dao ngam", name_zh: null }, "đào")).toBe(true);
  });

  it("khớp thứ tự từ tự do", () => {
    expect(matchesQuery({ name: "Đào ngâm", name_zh: null }, "ngam dao")).toBe(
      true
    );
  });

  it("không khớp khi thiếu từ", () => {
    expect(matchesQuery({ name: "Trà sữa", name_zh: null }, "xyz")).toBe(false);
  });

  it("khớp tên tiếng Trung trong name_zh", () => {
    expect(matchesQuery({ name: "Hồng trà", name_zh: "紅茶" }, "紅茶")).toBe(
      true
    );
    expect(matchesQuery({ name: "Hồng trà", name_zh: "紅茶" }, "綠茶")).toBe(
      false
    );
  });
});
