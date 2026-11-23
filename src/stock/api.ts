import { subscribeTables } from "../lib/subscribeTables";
import type { Tables, TablesInsert } from "../lib/database.types";
import { supabase } from "../lib/supabase";

const PAGE = 1000; // giới hạn dòng mỗi lần của PostgREST

export async function loadMovements(
  branchId: string
): Promise<Tables<"stock_movements">[]> {
  // shortcut: tải toàn bộ sổ theo trang, đủ cho quy mô nhỏ; đổi sang chỉ tải từ mốc chốt khi sổ lớn.
  const all: Tables<"stock_movements">[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("*")
      .eq("branch_id", branchId)
      .order("seq", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) return all;
  }
}

function newBatchId(): string {
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
  mfgDate: string,
  enteredOn: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("stock_movements").insert({
    branch_id: branchId,
    item_id: itemId,
    kind: "assign_mfg",
    qty,
    mfg_date: mfgDate,
    entered_on: enteredOn,
  });

  if (error) {
    return { error: "Không lưu được. Kiểm tra mạng." };
  }
  return { error: null };
}

// Các hàm ghi Ghi dùng trả lại chính các dòng vừa lưu (`.select()`) để màn hình cập nhật ngay, không tải lại sổ.
export type WriteResult = {
  error: string | null;
  rows: Tables<"stock_movements">[];
};

export async function saveUses(
  branchId: string,
  rows: { item_id: string; qty: number }[]
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from("stock_movements")
    .insert(
      rows.map((r) => ({
        branch_id: branchId,
        item_id: r.item_id,
        kind: "use" as const,
        qty: r.qty,
      }))
    )
    .select();
  return {
    error: error ? "Không lưu được. Kiểm tra mạng." : null,
    rows: data ?? [],
  };
}

// Hủy Ghi dùng (sổ chỉ ghi thêm): thêm dòng void; DB chỉ cho hủy Ghi dùng hôm nay.
export async function voidUse(
  branchId: string,
  use: { id: string; item_id: string }
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from("stock_movements")
    .insert({
      branch_id: branchId,
      item_id: use.item_id,
      kind: "void",
      qty: 0,
      voids_id: use.id,
    })
    .select();
  return {
    error: error ? "Không hủy được (có thể đã hủy hoặc qua ngày)." : null,
    rows: data ?? [],
  };
}

// Sửa = hủy dòng cũ + ghi dòng mới trong MỘT lệnh insert (nguyên tử): lỗi thì giữ nguyên dòng cũ.
export async function editUse(
  branchId: string,
  use: { id: string; item_id: string },
  qty: number
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from("stock_movements")
    .insert([
      {
        branch_id: branchId,
        item_id: use.item_id,
        kind: "void" as const,
        qty: 0,
        voids_id: use.id,
      },
      { branch_id: branchId, item_id: use.item_id, kind: "use" as const, qty },
    ])
    .select();
  return {
    error: error ? "Không sửa được (có thể đã hủy hoặc qua ngày)." : null,
    rows: data ?? [],
  };
}

export async function loadMemberEmails(
  branchId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("branch_member_emails", {
    p_branch_id: branchId,
  });
  if (error) throw error;
  const names = await supabase.from("profiles").select("user_id, display_name");
  const shown = new Map(
    (names.data ?? []).flatMap((p) =>
      p.display_name ? [[p.user_id, p.display_name] as const] : []
    )
  );
  // Tên hiển thị nếu người đó đã đặt, không thì email.
  return new Map(
    (data ?? []).map((r) => [r.user_id, shown.get(r.user_id) ?? r.email])
  );
}

export function subscribeMovements(
  branchId: string,
  onChange: () => void
): () => void {
  return subscribeTables("stock", branchId, ["stock_movements"], onChange);
}
