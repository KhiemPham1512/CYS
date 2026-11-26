import { messageForDbError } from "../../supabase/functions/admin-users/logic.ts";

// create_branch / move_member tự báo lỗi tiếng Việt (mã 22023, P0002, 42501); còn lại dịch như admin-users.
const OWN_MESSAGE = new Set(["22023", "P0002", "42501"]);

export function rpcError(
  error: { code?: string; hint?: string; message?: string } | null
): string | null {
  if (!error) return null;
  return OWN_MESSAGE.has(error.code ?? "") && error.message
    ? error.message
    : messageForDbError(error);
}
