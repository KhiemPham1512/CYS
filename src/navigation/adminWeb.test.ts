import { describe, expect, it } from "vitest";
import { ADMIN_PAGES, adminWebView } from "./adminWeb";

describe("adminWebView", () => {
  it("điện thoại: chạy như app, bất kể quyền", () => {
    expect(adminWebView(false, true)).toBe("app");
    expect(adminWebView(false, false)).toBe("app");
  });
  it("web + Quản trị: bảng điều khiển quản trị", () => {
    expect(adminWebView(true, true)).toBe("console");
  });
  it("web + nhân viên: bị chặn, không thấy gì khác", () => {
    expect(adminWebView(true, false)).toBe("forbidden");
  });
});

describe("ADMIN_PAGES", () => {
  it("thanh bên trái có đúng 4 mục theo thứ tự: Nhật ký, Người dùng, Danh mục, Sửa hàng loạt", () => {
    expect(ADMIN_PAGES.map((p) => p.label)).toEqual([
      "Nhật ký thay đổi",
      "Người dùng",
      "Danh mục",
      "Sửa hàng loạt",
    ]);
    expect(new Set(ADMIN_PAGES.map((p) => p.key)).size).toBe(4);
  });
});
