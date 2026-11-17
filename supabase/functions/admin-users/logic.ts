// Logic thuần dùng chung cho Edge Function admin-users (Deno) và app (Metro/Vitest).
// Không import gì: file phải chạy được ở cả hai môi trường.

export type AdminRequest =
  | { action: "list" }
  | { action: "create"; email: string; password: string; is_admin: boolean }
  | { action: "set_locked"; user_id: string; locked: boolean }
  | { action: "set_admin"; user_id: string; is_admin: boolean };

export const BAN_FOREVER = "876000h";
export const UNBAN = "none";

const INVALID = { ok: false, error: "Yêu cầu không hợp lệ" } as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateNewUser(
  email: string,
  password: string
): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  if (!EMAIL_RE.test(email.trim())) errors.email = "Email không hợp lệ";
  if (password.length < 8) errors.password = "Mật khẩu ít nhất 8 ký tự";
  return errors;
}

export function parseAdminRequest(
  body: unknown
): { ok: true; value: AdminRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return INVALID;
  const b = body as Record<string, unknown>;
  switch (b.action) {
    case "list":
      return { ok: true, value: { action: "list" } };
    case "create": {
      if (
        typeof b.email !== "string" ||
        typeof b.password !== "string" ||
        typeof b.is_admin !== "boolean"
      ) {
        return INVALID;
      }
      const email = b.email.trim().toLowerCase();
      const errors = validateNewUser(email, b.password);
      const first = errors.email ?? errors.password;
      if (first) return { ok: false, error: first };
      return {
        ok: true,
        value: {
          action: "create",
          email,
          password: b.password,
          is_admin: b.is_admin,
        },
      };
    }
    case "set_locked":
      if (
        typeof b.user_id !== "string" ||
        !UUID_RE.test(b.user_id) ||
        typeof b.locked !== "boolean"
      ) {
        return INVALID;
      }
      return {
        ok: true,
        value: { action: "set_locked", user_id: b.user_id, locked: b.locked },
      };
    case "set_admin":
      if (
        typeof b.user_id !== "string" ||
        !UUID_RE.test(b.user_id) ||
        typeof b.is_admin !== "boolean"
      ) {
        return INVALID;
      }
      return {
        ok: true,
        value: {
          action: "set_admin",
          user_id: b.user_id,
          is_admin: b.is_admin,
        },
      };
    default:
      return INVALID;
  }
}

export function canActOn(callerId: string, req: AdminRequest): string | null {
  if (req.action === "set_locked" && req.user_id === callerId && req.locked) {
    return "Không thể tự khóa chính mình";
  }
  if (req.action === "set_admin" && req.user_id === callerId && !req.is_admin) {
    return "Không thể tự bỏ quyền Quản trị của mình";
  }
  return null;
}

export function messageForDbError(
  err: { code?: string; hint?: string; message?: string } | null
): string {
  if (err?.hint === "last_admin") {
    return "Không thể bỏ hoặc khóa Quản trị cuối cùng";
  }
  if (err?.code === "23505") return "Người dùng đã thuộc Chi nhánh";
  return "Không thực hiện được. Thử lại sau.";
}
