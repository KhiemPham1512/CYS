import type { Tables, TablesInsert } from "../lib/database.types";
import { supabase } from "../lib/supabase";

export async function loadMovements(
  branchId: string
): Promise<Tables<"stock_movements">[]> {
  // shortcut: tải toàn bộ sổ, đủ cho quy mô nhỏ; đổi sang chỉ tải từ mốc chốt khi sổ lớn.
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("branch_id", branchId)
    .order("seq", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export function newBatchId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function saveCount(
  branchId: string,
  rows: { item_id: string; qty: number; expected_qty: number }[]
): Promise<{ batchId: string; error: string | null }> {
  const batchId = newBatchId();
  if (rows.length === 0) {
    return { batchId, error: null };
  }

  const payload: TablesInsert<"stock_movements">[] = rows.map((r) => ({
    branch_id: branchId,
    item_id: r.item_id,
    kind: "count",
    qty: r.qty,
    expected_qty: r.expected_qty,
    batch_id: batchId,
  }));

  const { error } = await supabase.from("stock_movements").insert(payload);
  if (error) {
    return { batchId, error: "Không lưu được. Kiểm tra mạng." };
  }
  return { batchId, error: null };
}

export async function saveAdjust(
  branchId: string,
  itemId: string,
  qty: number,
  expectedQty: number,
  note: string | null
): Promise<{ error: string | null }> {
  const trimmedNote = note?.trim() ? note.trim() : null;
  const { error } = await supabase.from("stock_movements").insert({
    branch_id: branchId,
    item_id: itemId,
    kind: "adjust",
    qty,
    expected_qty: expectedQty,
    note: trimmedNote,
  });

  if (error) {
    return { error: "Không lưu được. Kiểm tra mạng." };
  }
  return { error: null };
}

export async function assignMfg(
  branchId: string,
  itemId: string,
  qty: number,
  mfgDate: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("stock_movements").insert({
    branch_id: branchId,
    item_id: itemId,
    kind: "assign_mfg",
    qty,
    mfg_date: mfgDate,
  });

  if (error) {
    return { error: "Không lưu được. Kiểm tra mạng." };
  }
  return { error: null };
}

export function subscribeMovements(
  branchId: string,
  onChange: () => void
): () => void {
  const channel = supabase
    .channel(`stock-${branchId}-${Math.random().toString(36).slice(2)}`) // tên riêng mỗi lần: supabase-js trả lại kênh cũ nếu trùng tên
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "stock_movements",
        filter: `branch_id=eq.${branchId}`,
      },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
