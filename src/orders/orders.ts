import { round4 } from "../stock/qty";

export type Order = { id: string; placed_at: string | null };
export type OrderLine = { order_id: string; item_id: string; qty: number };

// Đơn nháp sửa được; đã đặt (có placed_at) thì khóa.
export const isEditable = (order: Order): boolean => order.placed_at === null;

// Hàng đang về của từng món = tổng dòng thuộc các đơn đã đặt.
// shortcut: chưa trừ phần đã nhận; việc gỡ Hàng đang về khi nhận là của #8 (Nhận hàng).
export function incomingByItem(
  orders: Order[],
  lines: OrderLine[]
): Map<string, number> {
  const placed = new Set(orders.filter((o) => !isEditable(o)).map((o) => o.id));
  const incoming = new Map<string, number>();
  for (const l of lines)
    if (placed.has(l.order_id))
      incoming.set(l.item_id, round4((incoming.get(l.item_id) ?? 0) + l.qty));
  return incoming;
}

// Tồn kho dự tính = Tồn kho thực tế + Hàng đang về.
export const projectedQty = (actual: number, incoming: number): number =>
  round4(actual + incoming);
