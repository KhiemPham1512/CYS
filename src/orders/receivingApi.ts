import { supabase } from "../lib/supabase";
import type { OwedRow } from "./receiving";

const NET_ERROR = "Không lưu được. Kiểm tra mạng.";

function mapRpcError(
  error: { code?: string; message: string } | null
): string | null {
  if (!error) return null;
  if (error.code === "23505") return "Dòng này đã được nhận rồi";
  if (error.code === "22023") return error.message;
  return NET_ERROR;
}

export async function loadReceivingData(branchId: string): Promise<{
  receivedLineIds: Set<string>;
  owed: OwedRow[];
}> {
  const [receipts, owed] = await Promise.all([
    supabase
      .from("purchase_receipts")
      .select("order_line_id")
      .eq("branch_id", branchId),
    supabase
      .from("supplier_owed")
      .select("item_id, kind, qty")
      .eq("branch_id", branchId),
  ]);
  if (receipts.error) throw receipts.error;
  if (owed.error) throw owed.error;
  return {
    receivedLineIds: new Set((receipts.data ?? []).map((r) => r.order_line_id)),
    owed: owed.data ?? [],
  };
}

export async function receiveLine(
  lineId: string,
  received: number,
  damaged: number,
  mfgDate: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("receive_order_line", {
    p_line_id: lineId,
    p_received: received,
    p_damaged: damaged,
    p_mfg: mfgDate,
  });
  return { error: mapRpcError(error) };
}

export async function settleOwed(
  itemId: string,
  qty: number,
  mfgDate: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("settle_owed", {
    p_item_id: itemId,
    p_qty: qty,
    p_mfg: mfgDate,
  });
  return { error: mapRpcError(error) };
}

export function subscribeReceiving(
  branchId: string,
  onChange: () => void
): () => void {
  const channel = supabase.channel(
    `receiving-${branchId}-${Math.random().toString(36).slice(2)}`
  );
  for (const table of ["purchase_receipts", "supplier_owed"]) {
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
