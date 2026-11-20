// Web chỉ dành cho Quản trị: bảng điều khiển có thanh bên trái. Điện thoại giữ nguyên app.
export type AdminPageKey = "audit" | "users" | "catalog" | "bulk";

export const ADMIN_PAGES: { key: AdminPageKey; label: string }[] = [
  { key: "audit", label: "Nhật ký thay đổi" },
  { key: "users", label: "Người dùng" },
  { key: "catalog", label: "Danh mục" },
  { key: "bulk", label: "Sửa hàng loạt" },
];

export function adminWebView(
  isWeb: boolean,
  isAdmin: boolean
): "app" | "console" | "forbidden" {
  if (!isWeb) return "app";
  return isAdmin ? "console" : "forbidden";
}
