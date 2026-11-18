import type { Tables } from "../lib/database.types";
import { round4 } from "./qty";

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
  | "id"
  | "voids_id"
  | "created_by"
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

// shortcut: múi giờ cố định giờ Việt Nam (UTC+7) để mọi máy ra cùng "ngày vào kho";
// khi có Chi nhánh ở múi giờ khác thì lưu múi giờ theo Chi nhánh.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// Ngày (giờ Việt Nam) của một thời điểm ISO, dạng yyyy-mm-dd.
export function localDate(iso: string): string {
  return new Date(Date.parse(iso) + VN_OFFSET_MS).toISOString().slice(0, 10);
}

// Giờ:phút (giờ Việt Nam) của một thời điểm ISO, khớp ranh giới "hôm nay".
export function localTime(iso: string): string {
  return new Date(Date.parse(iso) + VN_OFFSET_MS).toISOString().slice(11, 16);
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

const voidedIds = (movements: Movement[]) =>
  new Set(movements.flatMap((m) => (m.voids_id ? [m.voids_id] : [])));

// Ghi dùng trong ngày hôm nay (giờ Việt Nam) chưa bị hủy, theo thứ tự ghi.
export function todaysUses(movements: Movement[], nowIso: string): Movement[] {
  const voided = voidedIds(movements);
  const today = localDate(nowIso);
  return movements
    .filter(
      (m) =>
        m.kind === "use" &&
        !voided.has(m.id) &&
        localDate(m.created_at) === today
    )
    .sort((a, b) => a.seq - b.seq);
}

// Lần Ghi dùng hôm nay mới nhất của người dùng cho một món (để nút + trả lại 1).
export function lastUseToday(
  movements: Movement[],
  nowIso: string,
  userId: string,
  itemId: string
): Movement | null {
  const mine = todaysUses(movements, nowIso).filter(
    (m) => m.created_by === userId && m.item_id === itemId
  );
  return mine[mine.length - 1] ?? null;
}

// Số lần người dùng đã Ghi dùng từng món, để món hay dùng lên đầu.
export function usageCounts(
  movements: Movement[],
  userId: string
): Map<string, number> {
  const voided = voidedIds(movements);
  const counts = new Map<string, number>();
  for (const m of movements)
    if (m.kind === "use" && m.created_by === userId && !voided.has(m.id))
      counts.set(m.item_id, (counts.get(m.item_id) ?? 0) + 1);
  return counts;
}

export function stockLots(movements: Movement[]): Lot[] {
  const sorted = [...movements].sort((a, b) => a.seq - b.seq);
  const voided = voidedIds(sorted);
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
    } else if (m.kind === "use") {
      // shortcut: Ghi dùng bị hủy thì bỏ qua khi tính lại; nếu giữa chừng có Kiểm kho/Điều chỉnh
      // thì tổng đã đặt lại nên không lệch. Vượt tồn thì về 0, cảnh báo ở màn hình.
      if (!voided.has(m.id))
        takeOldestFirst(undated, takeOldestFirst(dated, m.qty));
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
