import { describe, expect, it } from "vitest";
import { planReceipt, waitingByItem } from "./receiving";

const base = {
  ordered: 10,
  received: 10,
  damaged: 0,
  mfgDate: null,
  tracksMfg: false,
};

describe("planReceipt", () => {
  it("đủ hàng: toàn bộ vào kho, không thiếu, không hư", () => {
    expect(planReceipt(base)).toEqual({
      ok: true,
      good: 10,
      short: 0,
      damaged: 0,
      mfgDate: null,
    });
  });

  it("món theo dõi Ngày sản xuất thiếu ngày: không cho nhận", () => {
    const r = planReceipt({ ...base, tracksMfg: true });
    expect(r).toEqual({ ok: false, error: "Cần nhập Ngày sản xuất" });
  });

  it("số không hợp lệ: nhận quá số đặt, hư quá số nhận, số âm", () => {
    expect(planReceipt({ ...base, received: 11 })).toEqual({
      ok: false,
      error: "Nhận nhiều hơn số đã đặt",
    });
    expect(planReceipt({ ...base, received: 5, damaged: 6 })).toEqual({
      ok: false,
      error: "Hàng hư nhiều hơn số đã nhận",
    });
    expect(planReceipt({ ...base, received: -1 }).ok).toBe(false);
    expect(planReceipt({ ...base, damaged: -1 }).ok).toBe(false);
  });

  it("nhận toàn hàng hư: không có hàng tốt nên không cần Ngày sản xuất", () => {
    expect(
      planReceipt({ ...base, tracksMfg: true, received: 5, damaged: 5 })
    ).toEqual({ ok: true, good: 0, short: 5, damaged: 5, mfgDate: null });
  });

  it("thiếu hàng: chỉ phần nhận vào kho, phần chưa giao thành Thiếu", () => {
    expect(planReceipt({ ...base, received: 7 })).toMatchObject({
      ok: true,
      good: 7,
      short: 3,
      damaged: 0,
    });
  });

  it("hàng hư: trừ khỏi phần vào kho, ghi phần hư", () => {
    expect(planReceipt({ ...base, damaged: 2 })).toMatchObject({
      ok: true,
      good: 8,
      short: 0,
      damaged: 2,
    });
  });
});

describe("waitingByItem (Chờ nhà cung cấp)", () => {
  it("Thiếu + Trả hư trừ phần đã nhận bù, theo từng món", () => {
    const waiting = waitingByItem([
      { item_id: "x", kind: "short", qty: 3 },
      { item_id: "x", kind: "damaged", qty: 2 },
      { item_id: "x", kind: "settled", qty: 4 },
      { item_id: "y", kind: "short", qty: 1 },
    ]);
    expect(waiting.get("x")).toBe(1);
    expect(waiting.get("y")).toBe(1);
  });

  it("nhận bù hết thì món biến mất khỏi danh sách; nhận bù quá không âm", () => {
    const waiting = waitingByItem([
      { item_id: "x", kind: "short", qty: 3 },
      { item_id: "x", kind: "settled", qty: 3 },
      { item_id: "z", kind: "short", qty: 1 },
      { item_id: "z", kind: "settled", qty: 5 },
    ]);
    expect(waiting.has("x")).toBe(false);
    expect(waiting.has("z")).toBe(false);
  });
});
