import { localDate } from "../stock/ledger";
import { round4 } from "../stock/qty";

export type Order = { id: string; placed_at: string | null };
export type OrderLine = {
  id: string;
  order_id: string;
  item_id: string;
  qty: number;
};

// Đơn nháp sửa được; đã đặt (có placed_at) thì khóa.
export const isEditable = (order: Order): boolean => order.placed_at === null;

// Hàng đang về của từng món = tổng dòng thuộc các đơn đã đặt.
export function incomingByItem(
  orders: Order[],
  lines: OrderLine[],
  receivedLineIds: Set<string> = new Set() // dòng đã nhận: hết Hàng đang về (phần thiếu sang Chờ nhà cung cấp)
): Map<string, number> {
  const placed = new Set(orders.filter((o) => !isEditable(o)).map((o) => o.id));
  const incoming = new Map<string, number>();
  for (const l of lines)
    if (placed.has(l.order_id) && !receivedLineIds.has(l.id))
      incoming.set(l.item_id, round4((incoming.get(l.item_id) ?? 0) + l.qty));
  return incoming;
}

// Tồn kho dự tính = Tồn kho thực tế + Hàng đang về.
export const projectedQty = (actual: number, incoming: number): number =>
  round4(actual + incoming);

const nextDay = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

// Ngày của đơn (giờ VN): đặt sau khi đã Kiểm kho trong ngày thì là đơn ngày mai.
// countTimes = thời điểm các dòng Kiểm kho (created_at). Cũng dùng làm "ngày hiện tại" của ảnh Xuất (truyền giờ hiện tại).
export function businessDay(at: string, countTimes: string[]): string {
  const day = localDate(at);
  const atMs = Date.parse(at);
  const counted = countTimes.some(
    (t) => localDate(t) === day && Date.parse(t) < atMs
  );
  return counted ? nextDay(day) : day;
}

type DatedOrder = Order & { placed_at: string };
const placedOn = (
  orders: Order[],
  countTimes: string[],
  keep: (day: string) => boolean
): DatedOrder[] =>
  orders.filter(
    (o): o is DatedOrder =>
      o.placed_at !== null && keep(businessDay(o.placed_at, countTimes))
  );

// Ảnh Đặt hàng ngày D: mọi dòng của các đơn ngày D (kể cả đã nhận), không cộng đơn ngày khác.
export const orderedOnDay = (
  orders: Order[],
  lines: OrderLine[],
  day: string,
  countTimes: string[]
): Map<string, number> =>
  incomingByItem(
    placedOn(orders, countTimes, (d) => d === day),
    lines
  );

// Ảnh Tồn kho ngày D: Hàng đang về chỉ của các đơn trước ngày D (đơn ngày D chưa tính).
export const incomingBefore = (
  orders: Order[],
  lines: OrderLine[],
  receivedLineIds: Set<string>,
  day: string,
  countTimes: string[]
): Map<string, number> =>
  incomingByItem(
    placedOn(orders, countTimes, (d) => d < day),
    lines,
    receivedLineIds
  );

export type PendingBlock = {
  key: string; // `${ngày}|${nhóm}`
  day: string; // Ngày của đơn (yyyy-mm-dd)
  groupId: string;
  lines: {
    key: string; // `${ngày}|${nhóm}|${món}`, khóa cho các ô nhập
    item_id: string;
    qty: number; // tổng đã đặt
    parts: { id: string; qty: number }[]; // các dòng đơn gốc, đơn cũ nhất trước
  }[];
};

// Hàng đang về chưa nhận, tách theo Ngày của đơn rồi theo Nhóm: biết hàng này thuộc đơn ngày nào để nhận đúng.
// Chỉ các đơn CÙNG ngày, cùng Nhóm mới gộp dòng cùng món. Khối xếp theo ngày tăng dần.
export function pendingBlocks(
  orders: { id: string; group_id: string; placed_at: string | null }[],
  lines: { id: string; order_id: string; item_id: string; qty: number }[],
  received: Set<string>,
  countTimes: string[]
): PendingBlock[] {
  const placed = new Map(
    orders.flatMap((o) =>
      o.placed_at === null ? [] : [[o.id, { ...o, placed_at: o.placed_at }]]
    )
  );
  const pending = lines
    .filter((l) => !received.has(l.id) && placed.has(l.order_id))
    .sort((a, b) =>
      (placed.get(a.order_id)?.placed_at ?? "").localeCompare(
        placed.get(b.order_id)?.placed_at ?? ""
      )
    );
  const blocks = new Map<string, PendingBlock>();
  for (const line of pending) {
    const order = placed.get(line.order_id);
    if (!order) continue;
    const day = businessDay(order.placed_at, countTimes);
    const blockKey = `${day}|${order.group_id}`;
    let block = blocks.get(blockKey);
    if (!block) {
      block = { key: blockKey, day, groupId: order.group_id, lines: [] };
      blocks.set(blockKey, block);
    }
    const lineKey = `${blockKey}|${line.item_id}`;
    const part = { id: line.id, qty: line.qty };
    const existing = block.lines.find((l) => l.key === lineKey);
    if (existing) {
      existing.parts.push(part);
      existing.qty = round4(existing.qty + line.qty);
    } else {
      block.lines.push({
        key: lineKey,
        item_id: line.item_id,
        qty: line.qty,
        parts: [part],
      });
    }
  }
  return [...blocks.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// Hàng đang về của từng món theo Ngày của đơn: ngày (cũ trước) -> món -> số lượng. Cộng các ngày lại = incomingByItem.
export function incomingByDay(
  orders: { id: string; group_id: string; placed_at: string | null }[],
  lines: { id: string; order_id: string; item_id: string; qty: number }[],
  received: Set<string>,
  countTimes: string[]
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const block of pendingBlocks(orders, lines, received, countTimes)) {
    const day = out.get(block.day) ?? new Map<string, number>();
    for (const l of block.lines)
      day.set(l.item_id, round4((day.get(l.item_id) ?? 0) + l.qty));
    out.set(block.day, day);
  }
  return out;
}

export type ReceiptRow = {
  id: string;
  order_line_id: string;
  created_at: string;
  good_qty: number;
  short_qty: number;
  damaged_qty: number;
};
export type ReceivedBlock = {
  key: string; // `${ngày}|${nhóm}`
  day: string; // Ngày của đơn (yyyy-mm-dd)
  groupId: string;
  receivedAt: string; // lần nhận mới nhất trong khối
  receiptIds: string[];
  // Không gỡ được ở app: "short" = có Hàng thiếu/hư đã vào Chờ nhà cung cấp; "checked" = sau lần nhận đã Kiểm kho/Điều chỉnh món đó.
  blocked: "short" | "checked" | null;
  lines: { item_id: string; qty: number }[]; // số nhận tốt theo món
};

// Các lần Nhận hàng gần đây gom theo Ngày của đơn rồi Nhóm (mới nhận trước), để Quản trị gỡ lần nhận nhầm.
export function receivedBlocks(
  orders: { id: string; group_id: string; placed_at: string | null }[],
  lines: { id: string; order_id: string; item_id: string; qty: number }[],
  receipts: ReceiptRow[],
  countTimes: string[],
  checkedAt: Map<string, string> = new Map() // món -> lần Kiểm kho/Điều chỉnh mới nhất
): ReceivedBlock[] {
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const blocks = new Map<string, ReceivedBlock>();
  for (const r of receipts) {
    const line = lineById.get(r.order_line_id);
    const order = line && orderById.get(line.order_id);
    if (!line || !order || order.placed_at === null) continue;
    const day = businessDay(order.placed_at, countTimes);
    const key = `${day}|${order.group_id}`;
    let block = blocks.get(key);
    if (!block) {
      block = {
        key,
        day,
        groupId: order.group_id,
        receivedAt: r.created_at,
        receiptIds: [],
        blocked: null,
        lines: [],
      };
      blocks.set(key, block);
    }
    block.receiptIds.push(r.id);
    if (r.created_at > block.receivedAt) block.receivedAt = r.created_at;
    if (r.short_qty > 0 || r.damaged_qty > 0) block.blocked = "short";
    else if (
      !block.blocked &&
      (checkedAt.get(line.item_id) ?? "") > r.created_at
    )
      block.blocked = "checked";
    const item = block.lines.find((l) => l.item_id === line.item_id);
    if (item) item.qty = round4(item.qty + r.good_qty);
    else block.lines.push({ item_id: line.item_id, qty: r.good_qty });
  }
  return [...blocks.values()].sort((a, b) =>
    b.receivedAt.localeCompare(a.receivedAt)
  );
}

// Đơn nháp đang mở của Nhóm vừa biến mất hoặc bị thay bằng nháp mới (máy khác đã đặt/xóa): số trên màn đã cũ, đặt tiếp sẽ thành đơn trùng.
export function draftGoneElsewhere(
  shownDraftId: string | null,
  draft: { id: string } | null,
  orders: { id: string; group_id: string }[],
  groupId: string | null
): boolean {
  if (!shownDraftId || draft?.id === shownDraftId) return false;
  const old = orders.find((o) => o.id === shownDraftId);
  return !old || old.group_id === groupId;
}

// Nhận hàng theo thứ tự (máy chủ receive_order_line kiểm cùng luật): chỉ đơn ngày cũ nhất còn chờ, và chỉ khi
// đã đặt đơn cho ngày sau (hàng đơn ngày D về sau khi đặt đơn D+1), tính chung mọi Nhóm. "noNext": chỉ Quản trị nhận.
export function receiveLock(
  day: string,
  pendingDays: string[],
  placedDays: string[]
): "ok" | "older" | "noNext" {
  if (pendingDays.some((d) => d < day)) return "older";
  return placedDays.some((d) => d > day) ? "ok" : "noNext";
}
