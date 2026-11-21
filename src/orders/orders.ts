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

// Bảng "đơn đã đặt" của một Nhóm, gộp thành một: cộng số lượng các dòng đã đặt mà chưa nhận hàng
// (đặt thêm lần nữa thì cộng dồn). Nhận hết rồi thì hiện lại đơn gần nhất để bảng không trống.
// `orders` là các đơn đã đặt của Nhóm đó. `placedAt` là giờ đặt của đơn mới nhất.
export function sheetQtyByItem(
  orders: Order[],
  lines: OrderLine[],
  receivedLineIds: Set<string>
): { qty: Map<string, number>; placedAt: string | null } {
  const placed = orders.filter((o) => !isEditable(o));
  const latest = [...placed].sort((a, b) =>
    (b.placed_at ?? "").localeCompare(a.placed_at ?? "")
  )[0];
  if (!latest) return { qty: new Map(), placedAt: null };
  const pending = incomingByItem(placed, lines, receivedLineIds);
  const qty =
    pending.size > 0 ? pending : incomingByItem([latest], lines, new Set());
  return { qty, placedAt: latest.placed_at };
}

// Đơn đã đặt của mọi Nhóm gộp một bảng (món → số lượng) để so với đơn nhà cung cấp gửi chung nhiều Nhóm.
// Mỗi Nhóm tính như sheetQtyByItem; một món chỉ thuộc một Nhóm nên không cộng đụng nhau.
export function orderedByItem(
  orders: (Order & { group_id: string })[],
  lines: OrderLine[],
  receivedLineIds: Set<string>
): Map<string, number> {
  const byGroup = new Map<string, (Order & { group_id: string })[]>();
  for (const o of orders) {
    const list = byGroup.get(o.group_id);
    if (list) list.push(o);
    else byGroup.set(o.group_id, [o]);
  }
  const all = new Map<string, number>();
  for (const groupOrders of byGroup.values())
    for (const [item, qty] of sheetQtyByItem(
      groupOrders,
      lines,
      receivedLineIds
    ).qty)
      all.set(item, qty);
  return all;
}
