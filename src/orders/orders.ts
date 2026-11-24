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
