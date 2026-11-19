import type { Lot } from "../stock/ledger";
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

// Từng loại đã ghi cho một món (không trừ chéo) để biết còn nợ vì thiếu hay vì hư.
export function owedBreakdown(
  rows: OwedRow[]
): Map<string, { short: number; damaged: number; settled: number }> {
  const out = new Map<
    string,
    { short: number; damaged: number; settled: number }
  >();
  for (const r of rows) {
    const b = out.get(r.item_id) ?? { short: 0, damaged: 0, settled: 0 };
    b[r.kind] = round4(b[r.kind] + r.qty);
    out.set(r.item_id, b);
  }
  return out;
}

export type GroupLineInput = {
  key: string;
  name: string;
  ordered: number;
  short: number; // số hàng thiếu (chưa về)
  damaged: number;
  mfgDate: string | null;
  tracksMfg: boolean;
};

export type GroupReceiptPlan =
  | {
      ok: true;
      lines: {
        key: string;
        received: number;
        plan: Extract<ReceiptPlan, { ok: true }>;
      }[];
    }
  | { ok: false; errors: { key: string; name: string; error: string }[] };

// Một nút "Đã nhận hàng" cho cả Nhóm: có dòng nào sai thì chặn cả Nhóm và nêu từng dòng.
export function planGroupReceipt(inputs: GroupLineInput[]): GroupReceiptPlan {
  const lines: Extract<GroupReceiptPlan, { ok: true }>["lines"] = [];
  const errors: { key: string; name: string; error: string }[] = [];
  for (const i of inputs) {
    const received = round4(i.ordered - i.short);
    const plan = planReceipt({ ...i, received });
    if (plan.ok) lines.push({ key: i.key, received, plan });
    else errors.push({ key: i.key, name: i.name, error: plan.error });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, lines };
}

export type SettleLineInput = {
  key: string;
  name: string;
  waiting: number; // số đang Chờ nhà cung cấp
  stillMissing: number; // số vẫn còn thiếu sau lần nhận này (mặc định = waiting: chưa về)
  mfgDate: string | null;
  tracksMfg: boolean;
};

export type GroupSettlePlan =
  | { ok: true; lines: { key: string; qty: number; mfgDate: string | null }[] }
  | { ok: false; errors: { key: string; name: string; error: string }[] };

// Nhận bù cả Nhóm: món không đổi số thì bỏ qua; có dòng sai thì chặn cả Nhóm.
export function planGroupSettle(inputs: SettleLineInput[]): GroupSettlePlan {
  const lines: Extract<GroupSettlePlan, { ok: true }>["lines"] = [];
  const errors: { key: string; name: string; error: string }[] = [];
  for (const i of inputs) {
    const qty = round4(i.waiting - i.stillMissing);
    const error =
      i.stillMissing < 0 || i.stillMissing > i.waiting
        ? "Số lượng không hợp lệ"
        : qty > 0 && i.tracksMfg && !i.mfgDate
          ? "Cần nhập Ngày sản xuất"
          : null;
    if (error) errors.push({ key: i.key, name: i.name, error });
    else if (qty > 0) lines.push({ key: i.key, qty, mfgDate: i.mfgDate });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, lines };
}

export type AllocLine = { id: string; qty: number };

// Món cùng Nhóm đặt ở nhiều đơn được gộp một dòng khi nhận. Chia số thiếu/hư về từng dòng đơn
// (lines đã sắp đơn cũ nhất trước): hàng về lấp đầy đơn cũ trước nên phần thiếu rơi vào đơn mới nhất;
// hàng hư tính vào phần đã nhận của đơn cũ trước. Số đầu vào đã được planReceipt kiểm hợp lệ.
export function allocateReceipt(
  lines: AllocLine[],
  short: number,
  damaged: number
): { id: string; received: number; damaged: number }[] {
  let toReceive = round4(lines.reduce((s, l) => s + l.qty, 0) - short);
  let toDamage = damaged;
  return lines.map((l) => {
    const received = Math.min(l.qty, toReceive);
    toReceive = round4(toReceive - received);
    const bad = Math.min(received, toDamage);
    toDamage = round4(toDamage - bad);
    return { id: l.id, received: round4(received), damaged: round4(bad) };
  });
}

export type ReturnPlan =
  | { ok: true; qty: number; mfgDate: string | null; enteredOn: string | null }
  | { ok: false; error: string };

// Trả hàng hư sau khi đã vào kho: trừ đúng một Lô, không vượt số của Lô đó.
// shortcut: số của Lô tính lúc đọc sổ ở app; máy chủ chỉ kiểm số > 0 (hai máy trả cùng lúc có thể vượt, sổ cắt về 0).
export function planReturn(lot: Lot | undefined, qty: number): ReturnPlan {
  if (!lot) return { ok: false, error: "Chưa chọn Lô" };
  if (!(qty > 0)) return { ok: false, error: "Số lượng phải lớn hơn 0" };
  if (qty > lot.qty) return { ok: false, error: "Trả nhiều hơn số của Lô" };
  return {
    ok: true,
    qty: round4(qty),
    mfgDate: lot.mfgDate,
    enteredOn: lot.mfgDate ? null : (lot.enteredOn ?? null),
  };
}
