import type { ItemChanges } from "../catalog/bulkEdit";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";

export type AuditRow =
  Database["public"]["Functions"]["audit_feed"]["Returns"][number];

export type AuditFilters = {
  actor: string | null;
  from: string | null; // yyyy-mm-dd
  to: string | null;
  itemId: string | null;
};

export async function loadAuditFeed(
  branchId: string,
  f: AuditFilters
): Promise<{ rows: AuditRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("audit_feed", {
    p_branch: branchId,
    p_actor: f.actor,
    p_from: f.from,
    p_to: f.to,
    p_item: f.itemId,
  });
  if (error)
    return {
      rows: [],
      error:
        error.code === "42501"
          ? "Chỉ Quản trị xem được Nhật ký."
          : "Không tải được Nhật ký. Kiểm tra mạng.",
    };
  return { rows: data ?? [], error: null };
}

// shortcut: lưu tuần tự từng món, không giao dịch; lỗi giữa chừng thì các món trước đã lưu (báo done).
export async function saveItemEdits(
  updates: { id: string; changes: ItemChanges }[]
): Promise<{ done: number; error: string | null }> {
  let done = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("items")
      .update(u.changes)
      .eq("id", u.id);
    if (error) return { done, error: "Không lưu được. Kiểm tra mạng." };
    done += 1;
  }
  return { done, error: null };
}
