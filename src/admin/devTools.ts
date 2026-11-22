import { supabase } from "../lib/supabase";

export type DevToolsResult = {
  error: string | null;
  count?: number;
};

export function devToolsError(
  error: { code?: string; message?: string } | null
): string | null {
  if (!error) return null;
  if (error.code === "42501") return "Chỉ Quản trị làm được việc này.";
  if (error.code === "22023")
    return "Tên Chi nhánh không khớp hoặc thiếu mốc giờ.";
  if (error.code) return "Không thực hiện được. Thử lại hoặc báo lỗi.";
  return "Không lưu được. Kiểm tra mạng.";
}

export async function rollbackStock(
  branchId: string,
  sinceIso: string,
  actorId: string | null
): Promise<DevToolsResult> {
  const { data, error } = await supabase.rpc("rollback_stock", {
    p_branch: branchId,
    p_since: sinceIso,
    p_actor: actorId,
  });
  return {
    error: devToolsError(error),
    ...(typeof data === "number" ? { count: data } : {}),
  };
}

export async function restoreRollback(
  branchId: string,
  batchId: string
): Promise<DevToolsResult> {
  const { data, error } = await supabase.rpc("restore_rollback", {
    p_branch: branchId,
    p_batch: batchId,
  });
  return {
    error: devToolsError(error),
    ...(typeof data === "number" ? { count: data } : {}),
  };
}

export async function resetBranchActivity(
  branchId: string,
  confirmName: string
): Promise<DevToolsResult> {
  const { error } = await supabase.rpc("reset_branch_activity", {
    p_branch: branchId,
    p_confirm: confirmName,
  });
  return { error: devToolsError(error) };
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// Phân tích chuỗi 'dd/mm' hoặc 'dd/mm hh:mm' (giờ Việt Nam, năm lấy từ nowIso) sang ISO UTC.
export function parseCutoff(text: string, nowIso: string): string | null {
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(nowMs)) return null;
  const match = text
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const hour = match[3] !== undefined ? Number(match[3]) : 0;
  const minute = match[4] !== undefined ? Number(match[4]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const year = new Date(nowMs + VN_OFFSET_MS).getUTCFullYear();
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return new Date(d.getTime() - VN_OFFSET_MS).toISOString();
}
