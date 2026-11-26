import { describe, expect, it } from "vitest";
import { ADMIN_PAGES, adminWebView } from "./adminWeb";

describe("adminWebView", () => {
  it("điện thoại: chạy như app, bất kể quyền và lựa chọn", () => {
    expect(adminWebView(false, true, null)).toBe("app");
    expect(adminWebView(false, true, "console")).toBe("app");
    expect(adminWebView(false, false, null)).toBe("app");
  });
  it("web + Quản trị chưa chọn: màn chọn Quản trị hay app tồn kho", () => {
    expect(adminWebView(true, true, null)).toBe("choose");
  });
  it("web + Quản trị đã chọn: vào đúng màn đã chọn", () => {
    expect(adminWebView(true, true, "console")).toBe("console");
    expect(adminWebView(true, true, "app")).toBe("app");
  });
  it("web + nhân viên: dùng app đầy đủ như điện thoại (iPhone qua Safari, Thêm vào màn hình chính)", () => {
    expect(adminWebView(true, false, null)).toBe("app");
    expect(adminWebView(true, false, "console")).toBe("app");
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
