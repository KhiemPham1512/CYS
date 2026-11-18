import { describe, expect, it } from "vitest";
import {
  incomingByItem,
  isEditable,
  projectedQty,
  type Order,
  type OrderLine,
} from "./orders";

const draft: Order = { id: "d", placed_at: null };
const placed1: Order = { id: "p1", placed_at: "2026-11-18T03:00:00Z" };
const placed2: Order = { id: "p2", placed_at: "2026-11-18T04:00:00Z" };

describe("isEditable", () => {
  it("chỉ đơn nháp sửa được", () => {
    expect(isEditable(draft)).toBe(true);
    expect(isEditable(placed1)).toBe(false);
  });
});

describe("incomingByItem", () => {
  const lines: OrderLine[] = [
    { order_id: "d", item_id: "x", qty: 5 },
    { order_id: "p1", item_id: "x", qty: 2.5 },
    { order_id: "p2", item_id: "x", qty: 1 },
    { order_id: "p2", item_id: "y", qty: 4 },
  ];

  it("cộng các đơn đã đặt, bỏ đơn nháp", () => {
    const m = incomingByItem([draft, placed1, placed2], lines);
    expect(m.get("x")).toBe(3.5);
    expect(m.get("y")).toBe(4);
  });

  it("món không có Hàng đang về thì không có khóa", () => {
    expect(incomingByItem([draft], lines).size).toBe(0);
  });
});

describe("projectedQty", () => {
  it("Tồn kho dự tính = thực tế + Hàng đang về, làm tròn", () => {
    expect(projectedQty(10, 3)).toBe(13);
    expect(projectedQty(0.1, 0.2)).toBe(0.3);
    expect(projectedQty(0, 0)).toBe(0);
  });
});
