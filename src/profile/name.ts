export const MAX_NAME = 40;

// Gọn khoảng trắng; rỗng thì null (quay về hiện email); quá dài thì cắt.
export function cleanDisplayName(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();
  return t === "" ? null : t;
}

// Chữ cái đầu cho ảnh đại diện khi chưa có ảnh: từ tên hiển thị, không có thì từ email.
export function initialsOf(name: string | null, email: string): string {
  const src = name ?? email.split("@")[0] ?? "";
  return (src.trim().slice(0, 2) || "?").toUpperCase();
}
