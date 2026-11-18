import type { Tables } from "../lib/database.types";

export type Movement = Pick<
  Tables<"stock_movements">,
  | "seq"
  | "item_id"
  | "kind"
  | "qty"
  | "mfg_date"
  | "expected_qty"
  | "batch_id"
  | "created_at"
  | "entered_on"
>;

// Lô có Ngày sản xuất: mfgDate. Phần chưa có Ngày sản xuất tách theo ngày vào kho (enteredOn)
// để Thêm Ngày sản xuất đúng cho từng đợt.
export type Lot = {
  mfgDate: string | null;
  qty: number;
  enteredOn?: string;
};

export type CountDiff = {
  item_id: string;
  expected: number;
  actual: number;
  diff: number;
};

function round4(n: number): number {
  const rounded = Math.round(n * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// Ngày (giờ địa phương của máy) của một thời điểm ISO, dạng yyyy-mm-dd.
export function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function add(map: Map<string, number>, key: string, qty: number) {
  map.set(key, round4((map.get(key) ?? 0) + qty));
}

// Trừ amount theo khóa tăng dần (ngày sớm nhất trước); trả phần chưa trừ được.
function takeOldestFirst(map: Map<string, number>, amount: number): number {
  let rest = amount;
  for (const key of [...map.keys()].sort()) {
    if (rest <= 0) break;
    const take = Math.min(rest, map.get(key) ?? 0);
    add(map, key, -take);
    if ((map.get(key) ?? 0) <= 0) map.delete(key);
    rest = round4(rest - take);
  }
  return rest;
}

const sum = (map: Map<string, number>) =>
  [...map.values()].reduce((s, q) => s + q, 0);

export function stockLots(movements: Movement[]): Lot[] {
  const sorted = [...movements].sort((a, b) => a.seq - b.seq);
  const dated = new Map<string, number>(); // Ngày sản xuất → số lượng
  const undated = new Map<string, number>(); // ngày vào kho → số lượng chưa có Ngày sản xuất

  for (const m of sorted) {
    if (m.kind === "count" || m.kind === "adjust") {
      // Đặt tổng = qty nhưng giữ Ngày sản xuất: tăng → phần chưa có ngày, vào kho hôm nay;
      // giảm → trừ Lô Ngày sản xuất sớm nhất trước, rồi phần chưa có ngày vào kho sớm nhất.
      const diff = round4(m.qty - sum(dated) - sum(undated));
      if (diff > 0) add(undated, localDate(m.created_at), diff);
      else if (diff < 0)
        takeOldestFirst(undated, takeOldestFirst(dated, -diff));
    } else if (m.kind === "assign_mfg" && m.mfg_date && m.qty > 0) {
      let moved: number;
      if (m.entered_on) {
        moved = Math.min(m.qty, undated.get(m.entered_on) ?? 0);
        add(undated, m.entered_on, -moved);
        if ((undated.get(m.entered_on) ?? 0) <= 0) undated.delete(m.entered_on);
      } else {
        moved = round4(m.qty - takeOldestFirst(undated, m.qty)); // dòng cũ: phần sớm nhất
      }
      if (moved > 0) add(dated, m.mfg_date, moved);
    }
  }

  const lots: Lot[] = [];
  for (const mfgDate of [...dated.keys()].sort()) {
    const qty = round4(dated.get(mfgDate) ?? 0);
    if (qty > 0) lots.push({ mfgDate, qty });
  }
  for (const enteredOn of [...undated.keys()].sort()) {
    const qty = round4(undated.get(enteredOn) ?? 0);
    if (qty > 0) lots.push({ mfgDate: null, qty, enteredOn });
  }
  return lots;
}

export function totalQty(lots: Lot[]): number {
  let sum = 0;
  for (const lot of lots) {
    sum += lot.qty;
  }
  return round4(sum);
}

export function stockByItem(movements: Movement[]): Map<string, Lot[]> {
  const grouped = new Map<string, Movement[]>();
  for (const m of movements) {
    const list = grouped.get(m.item_id);
    if (list) {
      list.push(m);
    } else {
      grouped.set(m.item_id, [m]);
    }
  }

  const result = new Map<string, Lot[]>();
  for (const [itemId, list] of grouped.entries()) {
    result.set(itemId, stockLots(list));
  }
  return result;
}

export function countDiffs(
  movements: Movement[],
  batchId: string
): CountDiff[] {
  const sorted = [...movements].sort((a, b) => a.seq - b.seq);
  const diffs: CountDiff[] = [];

  for (const m of sorted) {
    if (
      m.kind === "count" &&
      m.batch_id === batchId &&
      m.expected_qty !== null
    ) {
      const diff = round4(m.qty - m.expected_qty);
      if (diff !== 0) {
        diffs.push({
          item_id: m.item_id,
          expected: m.expected_qty,
          actual: m.qty,
          diff,
        });
      }
    }
  }

  return diffs;
}
