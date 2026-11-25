import { subscribeTables } from "../lib/subscribeTables";
import { supabase } from "../lib/supabase";
import type { OwedRow } from "./receiving";
import type { ReceiptRow } from "./orders";

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

async function receiveLine(
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

// Trả hàng hư sau khi đã vào kho: trừ đúng một Lô (mfgDate hoặc enteredOn) và ghi vào Chờ nhà cung cấp.
export async function returnDamaged(
  itemId: string,
  qty: number,
  mfgDate: string | null,
  enteredOn: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("return_damaged", {
    p_item_id: itemId,
    p_qty: qty,
    p_mfg: mfgDate,
    p_entered_on: enteredOn,
  });
  return { error: mapRpcError(error) };
}

async function settleOwed(
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

// shortcut: lưu tuần tự từng dòng, không giao dịch; lỗi giữa chừng thì dòng trước đã nhận, dòng sau chưa (báo done), nâng cấp thành hàm máy chủ nhận cả Nhóm một giao dịch khi cần.
export async function receiveLines(
  lines: {
    lineId: string;
    received: number;
    damaged: number;
    mfgDate: string | null;
  }[]
): Promise<{ done: number; error: string | null }> {
  let done = 0;
  for (const line of lines) {
    const { error } = await receiveLine(
      line.lineId,
      line.received,
      line.damaged,
      line.mfgDate
    );
    if (error) return { done, error };
    done += 1;
  }
  return { done, error: null };
}

// shortcut: như receiveLines, nhận bù tuần tự không giao dịch.
export async function settleLines(
  lines: { itemId: string; qty: number; mfgDate: string | null }[]
): Promise<{ done: number; error: string | null }> {
  let done = 0;
  for (const line of lines) {
    const { error } = await settleOwed(line.itemId, line.qty, line.mfgDate);
    if (error) return { done, error };
    done += 1;
  }
  return { done, error: null };
}

export function subscribeReceiving(
  branchId: string,
  onChange: () => void
): () => void {
  return subscribeTables(
    "receiving",
    branchId,
    ["purchase_receipts", "supplier_owed"],
    onChange
  );
}

// Các lần nhận từ mốc sinceIso (Quản trị xem để gỡ nhận nhầm).
export async function loadRecentReceipts(
  branchId: string,
  sinceIso: string
): Promise<ReceiptRow[]> {
  const { data, error } = await supabase
    .from("purchase_receipts")
    .select("id, order_line_id, created_at, good_qty, short_qty, damaged_qty")
    .eq("branch_id", branchId)
    .gte("created_at", sinceIso);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    good_qty: Number(r.good_qty),
    short_qty: Number(r.short_qty),
    damaged_qty: Number(r.damaged_qty),
  }));
}

// Gỡ các lần nhận (chỉ Quản trị): hàm DB xóa dòng sổ kho và bản ghi nhận, ghi Nhật ký.
export async function undoReceipts(
  receiptIds: string[]
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("undo_receipts", {
    p_receipts: receiptIds,
  });
  if (!error) return { error: null };
  return {
    error: error.code
      ? "Không gỡ được (lần nhận có hàng thiếu/hư, đã gỡ rồi hoặc bạn không phải Quản trị)."
      : NET_ERROR,
  };
}
