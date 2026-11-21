import { describe, expect, it } from "vitest";
import {
  incomingByItem,
  businessDay,
  incomingBefore,
  isEditable,
  orderedOnDay,
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

// Giờ VN = UTC+7: 02:00Z = 9h sáng, 13:00Z = 20h tối, 14:00Z = 21h tối.
describe("businessDay (Ngày của đơn)", () => {
  const countedTonight = ["2026-11-21T13:00:00Z"];

  it("đặt trước khi Kiểm kho trong ngày: đơn hôm nay", () => {
    expect(businessDay("2026-11-21T02:00:00Z", countedTonight)).toBe(
      "2026-11-21"
    );
  });
  it("đặt sau khi đã Kiểm kho hôm nay: đơn ngày mai", () => {
    expect(businessDay("2026-11-21T14:00:00Z", countedTonight)).toBe(
      "2026-11-22"
    );
  });
  it("Kiểm kho của hôm qua không đẩy đơn sáng nay sang mai", () => {
    expect(businessDay("2026-11-22T02:00:00Z", countedTonight)).toBe(
      "2026-11-22"
    );
  });
  it("qua tháng", () => {
    expect(businessDay("2026-11-30T14:00:00Z", ["2026-11-30T13:00:00Z"])).toBe(
      "2026-12-01"
    );
  });
});

describe("đơn theo ngày: không cộng dồn đơn ngày mai vào hôm nay", () => {
  const counts = ["2026-11-21T13:00:00Z"];
  const o21: Order = { id: "o21", placed_at: "2026-11-21T02:00:00Z" };
  const o22: Order = { id: "o22", placed_at: "2026-11-21T14:00:00Z" }; // đặt gấp tối 21 sau Kiểm kho
  const nháp: Order = { id: "d", placed_at: null };
  const lines: OrderLine[] = [
    { id: "a", order_id: "o21", item_id: "x", qty: 6 },
    { id: "b", order_id: "o22", item_id: "x", qty: 3 },
    { id: "c", order_id: "o22", item_id: "y", qty: 2 },
    { id: "e", order_id: "d", item_id: "z", qty: 9 },
  ];
  const all = [o21, o22, nháp];

  it("ảnh Đặt hàng ngày 22 chỉ có đơn 22", () => {
    expect([...orderedOnDay(all, lines, "2026-11-22", counts)]).toEqual([
      ["x", 3],
      ["y", 2],
    ]);
  });
  it("ảnh Tồn kho ngày 22 chỉ tính đang về của đơn trước ngày 22", () => {
    expect([
      ...incomingBefore(all, lines, new Set(), "2026-11-22", counts),
    ]).toEqual([["x", 6]]);
  });
  it("đơn trước đã nhận hàng thì không còn đang về", () => {
    expect(
      incomingBefore(all, lines, new Set(["a"]), "2026-11-22", counts).size
    ).toBe(0);
  });
});
