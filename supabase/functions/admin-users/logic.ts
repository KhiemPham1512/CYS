// Logic thuần dùng chung cho Edge Function admin-users (Deno) và app (Metro/Vitest).
// Không import gì: file phải chạy được ở cả hai môi trường.

// branch_id: Quản trị cấp cao chọn quán; bỏ trống = quán của mình. Quản trị quán bị bỏ qua.
export type AdminRequest =
  | { action: "list"; branch_id?: string }
  | { action: "list_all" }
  | {
      action: "create";
      email: string;
      password: string;
      is_admin: boolean;
      branch_id?: string;
    }
  | { action: "set_locked"; user_id: string; locked: boolean }
  | { action: "set_admin"; user_id: string; is_admin: boolean }
  | { action: "set_password"; user_id: string; password: string };

export const BAN_FOREVER = "876000h";
export const UNBAN = "none";

const INVALID = { ok: false, error: "Yêu cầu không hợp lệ" } as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validatePassword = (password: string): string | null =>
  password.length < 8 ? "Mật khẩu ít nhất 8 ký tự" : null;

export function validateNewUser(
  email: string,
  password: string
): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  if (!EMAIL_RE.test(email.trim())) errors.email = "Email không hợp lệ";
  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;
  return errors;
}

export function parseAdminRequest(
  body: unknown
): { ok: true; value: AdminRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return INVALID;
  const b = body as Record<string, unknown>;
  if (
    b.branch_id !== undefined &&
    (typeof b.branch_id !== "string" || !UUID_RE.test(b.branch_id))
  ) {
    return INVALID;
  }
  const branch = b.branch_id === undefined ? {} : { branch_id: b.branch_id };
  switch (b.action) {
    case "list":
      return { ok: true, value: { action: "list", ...branch } };
    case "list_all":
      return { ok: true, value: { action: "list_all" } };
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
          ...branch,
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
    case "set_password": {
      if (
        typeof b.user_id !== "string" ||
        !UUID_RE.test(b.user_id) ||
        typeof b.password !== "string"
      ) {
        return INVALID;
      }
      const passwordError = validatePassword(b.password);
      if (passwordError) return { ok: false, error: passwordError };
      return {
        ok: true,
        value: {
          action: "set_password",
          user_id: b.user_id,
          password: b.password,
        },
      };
    }
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

export type CallerRole = "owner" | "branch_admin";

// Quyền theo vai trò (ADR 0002). targetIsAdmin: người đích có là Quản trị quán không
// (cấp cao cũng giữ is_admin ở quán mình nên Quản trị quán không đụng được cấp cao).
export function deniedFor(
  role: CallerRole,
  req: AdminRequest,
  targetIsAdmin?: boolean
): string | null {
  if (role === "owner") return null;
  if (
    req.action === "set_admin" ||
    req.action === "list_all" ||
    (req.action === "create" && req.is_admin)
  ) {
    return "Chỉ Quản trị cấp cao làm được việc này";
  }
  if (targetIsAdmin) return "Quản trị quán chỉ quản lý được Nhân viên";
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
