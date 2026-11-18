import { round4 } from "../stock/qty";

export type ReceiptInput = {
  ordered: number;
  received: number; // số thực nhận (kể cả hàng hư)
  damaged: number; // trong số thực nhận, phần hư
  mfgDate: string | null;
  tracksMfg: boolean;
};

export type ReceiptPlan =
  | {
      ok: true;
      good: number;
      short: number;
      damaged: number;
      mfgDate: string | null;
    }
  | { ok: false; error: string };

export function planReceipt(i: ReceiptInput): ReceiptPlan {
  if (i.received < 0 || i.damaged < 0)
    return { ok: false, error: "Số lượng không hợp lệ" };
  if (i.received > i.ordered)
    return { ok: false, error: "Nhận nhiều hơn số đã đặt" };
  if (i.damaged > i.received)
    return { ok: false, error: "Hàng hư nhiều hơn số đã nhận" };
  const good = round4(i.received - i.damaged);
  if (i.tracksMfg && good > 0 && !i.mfgDate)
    return { ok: false, error: "Cần nhập Ngày sản xuất" };
  return {
    ok: true,
    good,
    short: round4(i.ordered - i.received),
    damaged: i.damaged,
    mfgDate: i.mfgDate,
  };
}

export type OwedRow = {
  item_id: string;
  kind: "short" | "damaged" | "settled"; // Thiếu / Trả hư / Đã nhận bù
  qty: number;
};

// Chờ nhà cung cấp theo món = Thiếu + Hư − Đã nhận bù (không âm, bỏ món về 0).
// Không tính vào Tồn kho thực tế hay dự tính (projectedQty không nhận số này).
export function waitingByItem(rows: OwedRow[]): Map<string, number> {
  const net = new Map<string, number>();
  for (const r of rows) {
    const sign = r.kind === "settled" ? -1 : 1;
    net.set(r.item_id, round4((net.get(r.item_id) ?? 0) + sign * r.qty));
  }
  for (const [item, qty] of net) if (qty <= 0) net.delete(item);
  return net;
}
