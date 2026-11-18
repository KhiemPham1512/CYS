import { describe, expect, it } from "vitest";
import {
  allocateReceipt,
  planGroupReceipt,
  planGroupSettle,
  planReceipt,
  waitingByItem,
} from "./receiving";

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

describe("planGroupReceipt (một nút Đã nhận hàng cho cả Nhóm)", () => {
  const line = {
    key: "l1",
    name: "Món A",
    ordered: 10,
    short: 0,
    damaged: 0,
    mfgDate: null,
    tracksMfg: false,
  };

  it("mọi món hợp lệ: ra kế hoạch từng dòng, số thiếu quy ra số thực nhận", () => {
    const r = planGroupReceipt([
      line,
      { ...line, key: "l2", name: "Món B", short: 3, damaged: 2 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[0]).toMatchObject({ key: "l1", received: 10 });
    expect(r.lines[1]).toMatchObject({ key: "l2", received: 7 });
    expect(r.lines[1].plan).toMatchObject({ good: 5, short: 3, damaged: 2 });
  });

  it("món bắt buộc ngày mà chưa có ngày: chặn cả Nhóm, nêu đúng món", () => {
    const r = planGroupReceipt([
      line,
      { ...line, key: "l2", name: "Món theo dõi", tracksMfg: true },
    ]);
    expect(r).toEqual({
      ok: false,
      errors: [
        { key: "l2", name: "Món theo dõi", error: "Cần nhập Ngày sản xuất" },
      ],
    });
  });

  it("nhiều dòng sai: liệt kê hết; số thiếu quá số đặt cũng chặn", () => {
    const r = planGroupReceipt([
      { ...line, key: "a", name: "A", short: 11 },
      { ...line, key: "b", name: "B", tracksMfg: true },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.key)).toEqual(["a", "b"]);
  });
});

describe("planGroupSettle (nhận bù cho cả Nhóm trong tab Chờ nhà cung cấp)", () => {
  const line = {
    key: "x",
    name: "Món X",
    waiting: 5,
    stillMissing: 5, // mặc định: chưa về, không nhận gì
    mfgDate: null,
    tracksMfg: false,
  };

  it("món chưa chỉnh (còn thiếu = số đang chờ) thì bỏ qua, không nhận nhầm", () => {
    expect(planGroupSettle([line])).toEqual({ ok: true, lines: [] });
  });

  it("nhận một phần: số nhận = số chờ − số vẫn còn thiếu", () => {
    const r = planGroupSettle([{ ...line, stillMissing: 3 }]);
    expect(r).toEqual({
      ok: true,
      lines: [{ key: "x", qty: 2, mfgDate: null }],
    });
  });

  it("món bắt buộc ngày mà nhận có số lượng thì thiếu ngày sẽ chặn cả Nhóm", () => {
    const r = planGroupSettle([
      { ...line, stillMissing: 0, tracksMfg: true },
      { ...line, key: "y", name: "Món Y", stillMissing: 2 },
    ]);
    expect(r).toEqual({
      ok: false,
      errors: [{ key: "x", name: "Món X", error: "Cần nhập Ngày sản xuất" }],
    });
  });

  it("món bắt buộc ngày nhưng không nhận gì thì không cần ngày; số không hợp lệ bị chặn", () => {
    expect(planGroupSettle([{ ...line, tracksMfg: true }]).ok).toBe(true);
    expect(planGroupSettle([{ ...line, stillMissing: 6 }]).ok).toBe(false);
    expect(planGroupSettle([{ ...line, stillMissing: -1 }]).ok).toBe(false);
  });
});

describe("allocateReceipt (chia số nhận của món đã gộp về từng dòng đơn)", () => {
  const two = [
    { id: "a", qty: 6 },
    { id: "b", qty: 6 },
  ]; // đã sắp đơn cũ nhất trước

  it("nhận đủ: mỗi dòng nhận đủ số đã đặt", () => {
    expect(allocateReceipt(two, 0, 0)).toEqual([
      { id: "a", received: 6, damaged: 0 },
      { id: "b", received: 6, damaged: 0 },
    ]);
  });

  it("thiếu: hàng lấp đầy đơn cũ trước, phần thiếu rơi vào đơn mới nhất", () => {
    expect(allocateReceipt(two, 3, 0)).toEqual([
      { id: "a", received: 6, damaged: 0 },
      { id: "b", received: 3, damaged: 0 },
    ]);
    expect(allocateReceipt(two, 8, 0)).toEqual([
      { id: "a", received: 4, damaged: 0 },
      { id: "b", received: 0, damaged: 0 },
    ]);
  });

  it("hàng hư tính vào phần đã nhận của đơn cũ trước", () => {
    expect(allocateReceipt(two, 0, 8)).toEqual([
      { id: "a", received: 6, damaged: 6 },
      { id: "b", received: 6, damaged: 2 },
    ]);
  });

  it("tổng chia ra luôn khớp: nhận + thiếu = đã đặt, hư không vượt nhận", () => {
    const out = allocateReceipt(two, 5, 3);
    expect(out.reduce((s, l) => s + l.received, 0)).toBe(7);
    expect(out.reduce((s, l) => s + l.damaged, 0)).toBe(3);
    for (const l of out) expect(l.damaged).toBeLessThanOrEqual(l.received);
  });

  it("một dòng duy nhất: như planReceipt thường", () => {
    expect(allocateReceipt([{ id: "x", qty: 10 }], 3, 2)).toEqual([
      { id: "x", received: 7, damaged: 2 },
    ]);
  });
});
