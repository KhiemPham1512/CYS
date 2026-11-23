import type { RawLine } from "./orderReconcile";

// Kết quả đọc ảnh đơn (các dòng đã đọc, không phải ảnh) nhớ trên máy để rời tab hay thoát app vào lại không phải đọc lại.
const KEEP_MS = 24 * 60 * 60 * 1000;

// Khóa theo người dùng: người khác đăng nhập trên cùng máy không thấy đơn của người trước.
export const readCacheKey = (userId: string, branchId: string) =>
  `read-order:${userId}:${branchId}`;

export const packReadResults = (parts: RawLine[][], now: number): string =>
  JSON.stringify({ savedAt: now, parts });

const isLine = (l: unknown): l is RawLine => {
  const r = l as Record<string, unknown> | null;
  return (
    !!r &&
    typeof r.name === "string" &&
    r.name !== "" &&
    typeof r.qty === "number" &&
    typeof r.unit === "string"
  );
};

// Dữ liệu hỏng, sai dạng hoặc quá 24 giờ thì coi như không có.
export function unpackReadResults(
  raw: string | null,
  now: number
): { parts: RawLine[][]; savedAt: number } | null {
  if (!raw) return null;
  let data: { savedAt?: unknown; parts?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const { savedAt, parts } = data ?? {};
  if (typeof savedAt !== "number" || now - savedAt > KEEP_MS) return null;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  if (!parts.every((p) => Array.isArray(p) && p.every(isLine))) return null;
  return { parts: parts as RawLine[][], savedAt };
}
