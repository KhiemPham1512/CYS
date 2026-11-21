import { beforeEach, describe, expect, it, vi } from "vitest";

// Ranh giới ngoài: chỉ giả lập lời gọi Supabase, không giả lập hàm nội bộ.
const rpc = vi.fn();
vi.mock("../lib/supabase", () => ({ supabase: { rpc } }));

const { receiveLines, settleLines } = await import("./receivingApi");

beforeEach(() => rpc.mockReset());

const line = (lineId: string) => ({
  lineId,
  received: 5,
  damaged: 1,
  mfgDate: null,
});

describe("receiveLines", () => {
  it("lưu hết các dòng thì báo đủ số dòng, không lỗi", async () => {
    rpc.mockResolvedValue({ error: null });
    expect(await receiveLines([line("a"), line("b")])).toEqual({
      done: 2,
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("receive_order_line", {
      p_line_id: "a",
      p_received: 5,
      p_damaged: 1,
      p_mfg: null,
    });
  });

  it("dừng ngay ở dòng lỗi, dòng sau không được gọi, báo số dòng đã lưu", async () => {
    rpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: "23505", message: "dup" } });
    expect(await receiveLines([line("a"), line("b"), line("c")])).toEqual({
      done: 1,
      error: "Dòng này đã được nhận rồi",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe("settleLines", () => {
  it("lỗi mạng giữa chừng: báo số dòng đã nhận bù và thông báo kiểm mạng", async () => {
    rpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: "08006", message: "down" } });
    const lines = [
      { itemId: "x", qty: 1, mfgDate: null },
      { itemId: "y", qty: 2, mfgDate: "2026-11-01" },
      { itemId: "z", qty: 3, mfgDate: null },
    ];
    expect(await settleLines(lines)).toEqual({
      done: 1,
      error: "Không lưu được. Kiểm tra mạng.",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("lỗi dữ liệu (22023) trả nguyên lời của máy chủ", async () => {
    rpc.mockResolvedValue({
      error: { code: "22023", message: "Cần nhập Ngày sản xuất" },
    });
    expect(await settleLines([{ itemId: "x", qty: 1, mfgDate: null }])).toEqual(
      { done: 0, error: "Cần nhập Ngày sản xuất" }
    );
  });
});
