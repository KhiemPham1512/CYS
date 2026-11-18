import type { Tables } from "../lib/database.types";
import { supabase } from "../lib/supabase";

export type OrderRow = Tables<"purchase_orders">;
export type OrderLineRow = Tables<"purchase_order_lines">;

const NET_ERROR = "Không lưu được. Kiểm tra mạng.";

export async function loadOrders(
  branchId: string
): Promise<{ orders: OrderRow[]; lines: OrderLineRow[] }> {
  const [orders, lines] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("*")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false }),
    supabase.from("purchase_order_lines").select("*").eq("branch_id", branchId),
  ]);
  if (orders.error) throw orders.error;
  if (lines.error) throw lines.error;
  return { orders: orders.data ?? [], lines: lines.data ?? [] };
}

// Lưu nháp: tạo đơn nếu chưa có, rồi đồng bộ dòng (thêm/sửa/xóa) theo `wanted` (món → số lượng > 0).
// shortcut: nhiều lệnh nối nhau, không giao dịch; lỗi giữa chừng thì lần Lưu sau đồng bộ lại.
export async function saveDraft(
  branchId: string,
  groupId: string,
  existing: { order: OrderRow | null; lines: OrderLineRow[] },
  wanted: Map<string, number>
): Promise<{ orderId: string | null; error: string | null }> {
  let orderId = existing.order?.id ?? null;
  if (!orderId) {
    const { data, error } = await supabase
      .from("purchase_orders")
      .insert({ branch_id: branchId, group_id: groupId })
      .select("id")
      .single();
    if (error || !data) return { orderId: null, error: NET_ERROR };
    orderId = data.id;
  }

  const have = new Map(existing.lines.map((l) => [l.item_id, l]));
  const toInsert = [...wanted]
    .filter(([item]) => !have.has(item))
    .map(([item_id, qty]) => ({
      order_id: orderId,
      branch_id: branchId,
      item_id,
      qty,
    }));
  const toDelete = existing.lines
    .filter((l) => !wanted.has(l.item_id))
    .map((l) => l.id);
  const toUpdate = existing.lines.filter(
    (l) => wanted.has(l.item_id) && wanted.get(l.item_id) !== l.qty
  );

  const results = await Promise.all([
    toInsert.length
      ? supabase.from("purchase_order_lines").insert(toInsert)
      : null,
    toDelete.length
      ? supabase.from("purchase_order_lines").delete().in("id", toDelete)
      : null,
    ...toUpdate.map((l) =>
      supabase
        .from("purchase_order_lines")
        .update({ qty: wanted.get(l.item_id) })
        .eq("id", l.id)
    ),
  ]);
  if (results.some((r) => r?.error)) return { orderId, error: NET_ERROR };
  return { orderId, error: null };
}

// "Đã đặt đúng như đơn": khóa đơn; thời điểm do máy chủ đặt (trigger).
export async function placeOrder(
  orderId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("purchase_orders")
    .update({ placed_at: new Date().toISOString() })
    .eq("id", orderId);
  return { error: error ? NET_ERROR : null };
}

export async function deleteDraft(
  orderId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", orderId);
  return { error: error ? NET_ERROR : null };
}

export function subscribeOrders(
  branchId: string,
  onChange: () => void
): () => void {
  const channel = supabase.channel(
    `orders-${branchId}-${Math.random().toString(36).slice(2)}`
  );
  for (const table of ["purchase_orders", "purchase_order_lines"]) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `branch_id=eq.${branchId}`,
      },
      onChange
    );
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
