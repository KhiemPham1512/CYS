import { subscribeTables } from "../lib/subscribeTables";
import { supabase } from "../lib/supabase";
import type { Tables } from "../lib/database.types";

export type InUseRow = Tables<"in_use">;

export async function loadInUse(branchId: string): Promise<InUseRow[]> {
  const { data, error } = await supabase
    .from("in_use")
    .select("*")
    .eq("branch_id", branchId)
    .is("ended_at", null)
    .order("opened_on");
  if (error) throw error;
  return data ?? [];
}

// Mỗi Ghi dùng món có hạn sau khui dài thêm một dòng Đang dùng (ngày khui = hôm nay do máy chủ đặt).
// shortcut: một dòng cho mỗi lần Ghi dùng bất kể số lượng; hủy Ghi dùng không xóa dòng này (bấm "Hết").
export async function openInUse(
  branchId: string,
  itemIds: string[]
): Promise<{ error: string | null }> {
  if (itemIds.length === 0) return { error: null };
  const { error } = await supabase
    .from("in_use")
    .insert(itemIds.map((item_id) => ({ branch_id: branchId, item_id })));
  return { error: error ? "Không ghi được Đang dùng." : null };
}

export async function endInUse(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("in_use")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error ? "Không lưu được. Kiểm tra mạng." : null };
}

export function subscribeInUse(
  branchId: string,
  onChange: () => void
): () => void {
  return subscribeTables("in-use", branchId, ["in_use"], onChange);
}
