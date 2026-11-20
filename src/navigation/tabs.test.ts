import { describe, expect, it } from "vitest";
import { HUB_SECTIONS, MAIN_TABS } from "./tabs";

describe("thanh tab dưới", () => {
  it("năm mục theo thứ tự: Tồn kho (trang chủ), Ghi dùng, Hub, Danh mục, Menu", () => {
    expect(MAIN_TABS.map((t) => t.key)).toEqual([
      "stock",
      "use",
      "hub",
      "catalog",
      "menu",
    ]);
  });

  it("mỗi tab có nhãn để trình đọc màn hình đọc (không chỉ icon)", () => {
    for (const t of MAIN_TABS) expect(t.label.length).toBeGreaterThan(0);
  });
});

describe("Hub", () => {
  it("hai nhóm: Đơn hàng và Kho, đủ 7 chức năng", () => {
    expect(HUB_SECTIONS.map((s) => s.title)).toEqual(["Đơn hàng", "Kho"]);
    expect(HUB_SECTIONS[0].items.map((i) => i.key)).toEqual([
      "order",
      "receive",
      "owed",
      "readOrder",
    ]);
    expect(HUB_SECTIONS[1].items.map((i) => i.key)).toEqual([
      "count",
      "expiry",
      "export",
    ]);
  });

  it("Đọc ảnh đơn chưa có màn hình nên đánh dấu 'sắp có'; các mục khác dùng được", () => {
    const items = HUB_SECTIONS.flatMap((s) => s.items);
    expect(items.filter((i) => i.soon).map((i) => i.key)).toEqual([
      "readOrder",
    ]);
  });

  it("điện thoại không còn mục quản trị (Nhật ký, Người dùng, Sửa hàng loạt)", () => {
    const keys = [
      ...MAIN_TABS.map((t) => t.key),
      ...HUB_SECTIONS.flatMap((s) => s.items.map((i) => i.key)),
    ];
    for (const admin of ["audit", "users", "bulk"]) {
      expect(keys).not.toContain(admin);
    }
  });
});
