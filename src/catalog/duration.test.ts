import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "./duration";

describe("parseDuration", () => {
  it("chuỗi rỗng trả về null", () => {
    expect(parseDuration("", "month")).toEqual({ ok: true, value: null });
    expect(parseDuration("   ", "day")).toEqual({ ok: true, value: null });
  });

  it("chỉ có số dùng đơn vị mặc định", () => {
    expect(parseDuration("12", "month")).toEqual({
      ok: true,
      value: { amount: 12, unit: "month" },
    });
    expect(parseDuration(" 15 ", "day")).toEqual({
      ok: true,
      value: { amount: 15, unit: "day" },
    });
  });

  it("nhận diện hậu tố tháng không phân biệt hoa thường hay dấu", () => {
    for (const input of ["12 tháng", "12 thang", "12TH", "12m", "12thang"]) {
      expect(parseDuration(input, "day")).toEqual({
        ok: true,
        value: { amount: 12, unit: "month" },
      });
    }
  });

  it("nhận diện hậu tố ngày không phân biệt hoa thường hay dấu", () => {
    for (const input of ["15 ngày", "15 ngay", "15D", "15ngay"]) {
      expect(parseDuration(input, "month")).toEqual({
        ok: true,
        value: { amount: 15, unit: "day" },
      });
    }
  });

  it("quy đổi năm sang tháng (1 năm = 12 tháng, không đổi ra ngày)", () => {
    for (const input of ["3 năm", "3 nam", "3y", "3Y"]) {
      expect(parseDuration(input, "day")).toEqual({
        ok: true,
        value: { amount: 36, unit: "month" },
      });
    }
  });

  it("từ chối số <= 0, số thập phân hoặc hậu tố lạ", () => {
    for (const bad of [
      "0",
      "0 tháng",
      "-1",
      "1.5 tháng",
      "abc",
      "12 tuần",
      "tháng",
    ]) {
      expect(parseDuration(bad, "month")).toEqual({ ok: false });
    }
  });
});

describe("formatDuration", () => {
  it("định dạng theo đơn vị tháng hoặc ngày", () => {
    expect(formatDuration(12, "month")).toBe("12 tháng");
    expect(formatDuration(15, "day")).toBe("15 ngày");
  });
});
