// Điều hướng điện thoại: thanh tab dưới chỉ icon + Hub (bảng chức năng) + Menu.
// Nhật ký, Người dùng, Sửa hàng loạt không còn ở đây: chuyển sang web admin.
export type IconKey =
  | "stock"
  | "use"
  | "hub"
  | "catalog"
  | "menu"
  | "order"
  | "receive"
  | "owed"
  | "readOrder"
  | "count"
  | "expiry"
  | "export";

export type MainTabKey = "stock" | "use" | "hub" | "catalog" | "menu";
export type HubKey =
  "order" | "receive" | "owed" | "readOrder" | "count" | "expiry" | "export";

export const MAIN_TABS: { key: MainTabKey; label: string }[] = [
  { key: "stock", label: "Tồn kho" }, // trang chủ
  { key: "use", label: "Ghi dùng" },
  { key: "hub", label: "Chức năng" },
  { key: "catalog", label: "Danh mục" },
  { key: "menu", label: "Menu" },
];

export const HUB_SECTIONS: {
  title: string;
  items: { key: HubKey; label: string; soon?: boolean }[];
}[] = [
  {
    title: "Đơn hàng",
    items: [
      { key: "order", label: "Đặt hàng" },
      { key: "receive", label: "Nhận hàng" },
      { key: "owed", label: "Hàng thiếu" },
      { key: "readOrder", label: "Đọc ảnh đơn" },
    ],
  },
  {
    title: "Kho",
    items: [
      { key: "count", label: "Kiểm kho" },
      { key: "expiry", label: "Hạn dùng" },
      { key: "export", label: "Xuất ảnh" },
    ],
  },
];
