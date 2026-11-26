// Web: Quản trị chọn bảng điều khiển hoặc app tồn kho; nhân viên dùng app đầy đủ (iPhone qua Safari). Điện thoại giữ nguyên app.
export type AdminPageKey = "audit" | "users" | "catalog" | "bulk";

export const ADMIN_PAGES: { key: AdminPageKey; label: string }[] = [
  { key: "audit", label: "Nhật ký thay đổi" },
  { key: "users", label: "Người dùng" },
  { key: "catalog", label: "Danh mục" },
  { key: "bulk", label: "Sửa hàng loạt" },
];

// Từ bề rộng này trở lên các màn quản trị dùng bố cục máy tính (thanh bên, bảng).
export const WIDE_LAYOUT = 900;

export type WebMode = "console" | "app";

// Quản trị trên web (máy tính hoặc iPhone qua Safari) chọn mỗi lần đăng nhập: Quản trị hay app tồn kho.
export function adminWebView(
  isWeb: boolean,
  isAdmin: boolean,
  choice: WebMode | null
): WebMode | "choose" {
  if (!isWeb || !isAdmin) return "app";
  return choice ?? "choose";
}
