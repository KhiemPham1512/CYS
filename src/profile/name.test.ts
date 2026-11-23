import { describe, expect, it } from "vitest";
import { cleanDisplayName, initialsOf, MAX_NAME } from "./name";

describe("cleanDisplayName", () => {
  it("gọn khoảng trắng", () => {
    expect(cleanDisplayName("  Cô   Ba ")).toBe("Cô Ba");
  });
  it("rỗng thành null", () => {
    expect(cleanDisplayName("   ")).toBeNull();
  });
  it("cắt ở 40 ký tự", () => {
    expect(cleanDisplayName("x".repeat(60))?.length).toBe(MAX_NAME);
  });
});

describe("initialsOf", () => {
  it("ưu tiên tên hiển thị", () => {
    expect(initialsOf("an", "zed@x.com")).toBe("AN");
  });
  it("không có tên thì lấy email", () => {
    expect(initialsOf(null, "zed@x.com")).toBe("ZE");
  });
});
