import { describe, expect, it } from "vitest";
import {
  incomingByItem,
  isEditable,
  projectedQty,
  sheetQtyByItem,
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
    { id: "a", order_id: "d", item_id: "x", qty: 5 },
    { id: "b", order_id: "p1", item_id: "x", qty: 2.5 },
    { id: "c", order_id: "p2", item_id: "x", qty: 1 },
    { id: "d2", order_id: "p2", item_id: "y", qty: 4 },
  ];

  it("cộng các đơn đã đặt, bỏ đơn nháp", () => {
    const m = incomingByItem([draft, placed1, placed2], lines);
    expect(m.get("x")).toBe(3.5);
    expect(m.get("y")).toBe(4);
  });

  it("bỏ các dòng đã nhận (kể cả nhận thiếu): Hàng đang về hết hẳn", () => {
    const received = new Set(["l-p2-x"]);
    const withIds: OrderLine[] = [
      { id: "l-p1-x", order_id: "p1", item_id: "x", qty: 2.5 },
      { id: "l-p2-x", order_id: "p2", item_id: "x", qty: 1 },
    ];
    const m = incomingByItem([placed1, placed2], withIds, received);
    expect(m.get("x")).toBe(2.5);
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

describe("sheetQtyByItem (bảng đơn đã đặt gộp một)", () => {
  const o1: Order = { id: "o1", placed_at: "2026-11-17T03:00:00Z" };
  const o2: Order = { id: "o2", placed_at: "2026-11-18T03:00:00Z" };
  const lines: OrderLine[] = [
    { id: "l1", order_id: "o1", item_id: "x", qty: 6 },
    { id: "l2", order_id: "o2", item_id: "x", qty: 6 },
    { id: "l3", order_id: "o2", item_id: "y", qty: 2 },
  ];

  it("đặt thêm lần nữa thì cộng dồn; ngày là của đơn mới nhất", () => {
    const r = sheetQtyByItem([o1, o2], lines, new Set());
    expect(r.qty.get("x")).toBe(12);
    expect(r.qty.get("y")).toBe(2);
    expect(r.placedAt).toBe("2026-11-18T03:00:00Z");
  });

  it("dòng đã nhận hàng không còn tính", () => {
    const r = sheetQtyByItem([o1, o2], lines, new Set(["l1"]));
    expect(r.qty.get("x")).toBe(6);
  });

  it("nhận hết thì hiện lại đơn gần nhất để không trống", () => {
    const r = sheetQtyByItem([o1, o2], lines, new Set(["l1", "l2", "l3"]));
    expect(r.qty.get("x")).toBe(6);
    expect(r.qty.get("y")).toBe(2);
    expect(r.placedAt).toBe("2026-11-18T03:00:00Z");
  });

  it("chưa đặt đơn nào: rỗng", () => {
    const r = sheetQtyByItem([], lines, new Set());
    expect(r.qty.size).toBe(0);
    expect(r.placedAt).toBeNull();
  });
});
