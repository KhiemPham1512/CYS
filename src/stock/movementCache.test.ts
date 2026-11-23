import { describe, expect, it, vi } from "vitest";
import type { Tables } from "../lib/database.types";
import { syncMovements } from "./movementCache";

const row = (seq: number) => ({ seq }) as Tables<"stock_movements">;
const server = (seqs: number[]) => ({
  since: vi.fn(async (after: number) => seqs.filter((s) => s > after).map(row)),
  count: vi.fn(async () => seqs.length),
});

describe("syncMovements", () => {
  it("lần đầu tải đủ, không hỏi số dòng", async () => {
    const s = server([1, 2, 3]);
    const c = await syncMovements(undefined, s.since, s.count);
    expect(c.rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(s.count).not.toHaveBeenCalled();
  });

  it("lần sau chỉ tải dòng mới rồi nối vào", async () => {
    const first = await syncMovements(
      undefined,
      server([1, 2]).since,
      async () => 2
    );
    const s = server([1, 2, 3, 4]);
    const c = await syncMovements(first, s.since, s.count);
    expect(c.rows.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
    expect(s.since).toHaveBeenCalledTimes(1);
    expect(s.since).toHaveBeenCalledWith(2);
  });

  it("không có dòng mới thì giữ nguyên", async () => {
    const first = await syncMovements(
      undefined,
      server([1, 2]).since,
      async () => 2
    );
    const c = await syncMovements(first, server([1, 2]).since, async () => 2);
    expect(c.rows.map((r) => r.seq)).toEqual([1, 2]);
  });

  it("máy chủ có ít dòng hơn (đã xóa) thì tải lại đủ", async () => {
    const first = await syncMovements(
      undefined,
      server([1, 2, 3]).since,
      async () => 3
    );
    const s = server([3]);
    const c = await syncMovements(first, s.since, s.count);
    expect(c.rows.map((r) => r.seq)).toEqual([3]);
  });

  it("sót dòng seq nhỏ commit trễ thì tải lại đủ", async () => {
    const first = await syncMovements(
      undefined,
      server([1, 3]).since,
      async () => 2
    );
    const s = server([1, 2, 3]); // dòng 2 hiện sau khi đã đọc tới 3
    const c = await syncMovements(first, s.since, s.count);
    expect(c.rows.map((r) => r.seq)).toEqual([1, 2, 3]);
  });
});
