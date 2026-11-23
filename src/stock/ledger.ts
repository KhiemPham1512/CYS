import type { Tables } from "../lib/database.types";
import { round4 } from "./qty";

export type Movement = Pick<
  Tables<"stock_movements">,
  | "seq"
  | "item_id"
  | "kind"
  | "qty"
  | "qty_text"
  | "mfg_date"
  | "expected_qty"
  | "batch_id"
  | "created_at"
  | "entered_on"
  | "id"
  | "voids_id"
  | "created_by"
  | "note"
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
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

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

export const voidedIds = (movements: Movement[]) =>
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
    if (voided.has(m.id)) continue;
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
      takeOldestFirst(undated, takeOldestFirst(dated, m.qty));
    } else if (m.kind === "receive" && m.qty > 0) {
      // Nhận hàng: cộng vào Lô đúng Ngày sản xuất; không có ngày thì vào phần chưa có ngày (ngày vào kho).
      if (m.mfg_date) add(dated, m.mfg_date, m.qty);
      else add(undated, localDate(m.created_at), m.qty);
    } else if (m.kind === "return_damaged" && m.qty > 0) {
      // Trả hàng hư: trừ đúng Lô đã chọn (Ngày sản xuất, hoặc ngày vào kho nếu chưa có ngày).
      const [map, key] = m.mfg_date
        ? [dated, m.mfg_date]
        : [undated, m.entered_on ?? ""];
      const taken = Math.min(m.qty, map.get(key) ?? 0);
      add(map, key, -taken);
      if ((map.get(key) ?? 0) <= 0) map.delete(key);
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

const DAY_MS = 24 * 60 * 60 * 1000;
const RESET_HOUR_MS = 7 * 60 * 60 * 1000; // 7h sáng

// Mốc reset nhãn "Chưa kiểm": 7h sáng giờ Việt Nam gần nhất (= 00:00 UTC), trả về ISO UTC.
export function checkResetAt(nowIso: string): string {
  const vn = Date.parse(nowIso) + VN_OFFSET_MS;
  const vnDay = vn - (((vn % DAY_MS) + DAY_MS) % DAY_MS); // 00:00 giờ VN của ngày đó, tính bằng ms
  const sevenVn = vnDay + RESET_HOUR_MS;
  const boundaryVn = vn >= sevenVn ? sevenVn : sevenVn - DAY_MS;
  return new Date(boundaryVn - VN_OFFSET_MS).toISOString();
}

// shortcut: múi giờ UTC+7 cố định; dựa vào sổ đã tải (nếu sau này tải theo khoảng ngày thì Kiểm kho cũ có thể hiện sai là Chưa kiểm).
// Các món đã Kiểm kho (count) kể từ mốc reset 7h sáng. Ghi dùng/Điều chỉnh/Nhận hàng không đổi nhãn;
// các món còn lại là "Chưa kiểm".
export function checkedSince(
  movements: Movement[],
  nowIso: string
): Set<string> {
  const since = Date.parse(checkResetAt(nowIso));
  const voided = voidedIds(movements);
  return new Set(
    movements
      .filter(
        (m) =>
          m.kind === "count" &&
          !voided.has(m.id) &&
          Date.parse(m.created_at) >= since
      )
      .map((m) => m.item_id)
  );
}

export function countDiffs(
  movements: Movement[],
  batchId: string
): CountDiff[] {
  const sorted = [...movements].sort((a, b) => a.seq - b.seq);
  const voided = voidedIds(sorted);
  const diffs: CountDiff[] = [];

  for (const m of sorted) {
    if (
      m.kind === "count" &&
      !voided.has(m.id) &&
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

// Thời điểm các dòng Kiểm kho chưa bị hủy, dùng tính "Ngày của đơn".
export function countTimes(movements: Movement[]): string[] {
  const voided = voidedIds(movements);
  return movements
    .filter((m) => m.kind === "count" && !voided.has(m.id))
    .map((m) => m.created_at);
}

// Các đợt quay lui (dòng void do rollback_stock tạo), đợt mới nhất trước.
export function rollbackBatches(
  movements: Movement[]
): { batchId: string; at: string; count: number }[] {
  const byBatch = new Map<string, { at: string; count: number }>();
  for (const m of movements) {
    if (m.kind !== "void" || m.note !== "rollback" || !m.batch_id) continue;
    const cur = byBatch.get(m.batch_id);
    if (!cur) {
      byBatch.set(m.batch_id, { at: m.created_at, count: 1 });
    } else {
      cur.count += 1;
      if (Date.parse(m.created_at) > Date.parse(cur.at)) cur.at = m.created_at;
    }
  }
  return [...byBatch.entries()]
    .map(([batchId, v]) => ({ batchId, at: v.at, count: v.count }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

const ROLLBACK_KINDS = new Set<Movement["kind"]>([
  "count",
  "adjust",
  "assign_mfg",
  "use",
]);

// Số dòng sổ kho sẽ bị hủy nếu chạy rollback_stock với cùng mốc thời gian và người tạo.
export function rollbackPreview(
  movements: Movement[],
  sinceIso: string,
  actorId: string | null
): number {
  const voided = voidedIds(movements);
  const sinceMs = Date.parse(sinceIso);
  let n = 0;
  for (const m of movements) {
    if (
      ROLLBACK_KINDS.has(m.kind) &&
      !voided.has(m.id) &&
      Date.parse(m.created_at) >= sinceMs &&
      (actorId === null || m.created_by === actorId)
    ) {
      n += 1;
    }
  }
  return n;
}

// Chuỗi số lượng ở lần Kiểm kho/Điều chỉnh mới nhất chưa bị hủy của từng món.
export function latestQtyText(
  movements: Movement[]
): Map<string, string | null> {
  const voided = voidedIds(movements);
  const latest = new Map<string, { seq: number; text: string | null }>();
  for (const m of movements) {
    if ((m.kind !== "count" && m.kind !== "adjust") || voided.has(m.id)) {
      continue;
    }
    const cur = latest.get(m.item_id);
    if (!cur || m.seq > cur.seq) {
      latest.set(m.item_id, { seq: m.seq, text: m.qty_text ?? null });
    }
  }
  const result = new Map<string, string | null>();
  for (const [itemId, v] of latest.entries()) {
    result.set(itemId, v.text);
  }
  return result;
}
