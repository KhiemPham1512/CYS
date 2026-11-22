import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    rpc: rpcMock,
  },
}));

import {
  devToolsError,
  parseCutoff,
  resetBranchActivity,
  restoreRollback,
  rollbackStock,
} from "./devTools";

describe("devToolsError", () => {
  it("không lỗi trả về null", () => {
    expect(devToolsError(null)).toBeNull();
  });

  it("42501 báo chỉ Quản trị làm được", () => {
    expect(devToolsError({ code: "42501", message: "forbidden" })).toBe(
      "Chỉ Quản trị làm được việc này."
    );
  });

  it("22023 báo tên Chi nhánh không khớp hoặc thiếu mốc giờ", () => {
    expect(devToolsError({ code: "22023", message: "invalid" })).toBe(
      "Tên Chi nhánh không khớp hoặc thiếu mốc giờ."
    );
  });

  it("mã lỗi máy chủ khác báo không thực hiện được", () => {
    expect(devToolsError({ code: "23503", message: "fk" })).toBe(
      "Không thực hiện được. Thử lại hoặc báo lỗi."
    );
  });

  it("lỗi không có mã báo kiểm tra mạng", () => {
    expect(devToolsError({ message: "Failed to fetch" })).toBe(
      "Không lưu được. Kiểm tra mạng."
    );
  });
});

describe("devTools RPC wrappers", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("rollbackStock gọi rollback_stock đúng tham số và trả về số dòng", async () => {
    rpcMock.mockResolvedValueOnce({ data: 5, error: null });

    const res = await rollbackStock(
      "branch-1",
      "2026-11-20T07:05:00Z",
      "user-1"
    );

    expect(rpcMock).toHaveBeenCalledWith("rollback_stock", {
      p_branch: "branch-1",
      p_since: "2026-11-20T07:05:00Z",
      p_actor: "user-1",
    });
    expect(res).toEqual({ error: null, count: 5 });
  });

  it("rollbackStock ánh xạ lỗi khi máy chủ từ chối", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "not admin" },
    });

    const res = await rollbackStock("branch-1", "2026-11-20T07:05:00Z", null);

    expect(rpcMock).toHaveBeenCalledWith("rollback_stock", {
      p_branch: "branch-1",
      p_since: "2026-11-20T07:05:00Z",
      p_actor: null,
    });
    expect(res.error).toBe("Chỉ Quản trị làm được việc này.");
  });

  it("restoreRollback gọi restore_rollback và trả về số dòng khôi phục", async () => {
    rpcMock.mockResolvedValueOnce({ data: 3, error: null });

    const res = await restoreRollback("branch-1", "batch-9");

    expect(rpcMock).toHaveBeenCalledWith("restore_rollback", {
      p_branch: "branch-1",
      p_batch: "batch-9",
    });
    expect(res).toEqual({ error: null, count: 3 });
  });

  it("restoreRollback ánh xạ lỗi mạng", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "network down" },
    });

    const res = await restoreRollback("branch-1", "batch-9");

    expect(res.error).toBe("Không lưu được. Kiểm tra mạng.");
  });

  it("resetBranchActivity gọi reset_branch_activity và ánh xạ lỗi xác nhận tên", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    const ok = await resetBranchActivity("branch-1", "Chi nhánh mẫu");
    expect(rpcMock).toHaveBeenCalledWith("reset_branch_activity", {
      p_branch: "branch-1",
      p_confirm: "Chi nhánh mẫu",
    });
    expect(ok.error).toBeNull();

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "22023", message: "wrong confirm" },
    });

    const fail = await resetBranchActivity("branch-1", "Sai tên");
    expect(fail.error).toBe("Tên Chi nhánh không khớp hoặc thiếu mốc giờ.");
  });
});

describe("parseCutoff", () => {
  const nowIso = "2026-11-23T02:00:00.000Z"; // 2026-11-23 09:00 giờ VN

  it("đọc đúng dd/mm hh:mm theo giờ Việt Nam (UTC+7)", () => {
    expect(parseCutoff("23/11 08:30", nowIso)).toBe("2026-11-23T01:30:00.000Z");
    expect(parseCutoff(" 5/3 7:05 ", nowIso)).toBe("2026-03-05T00:05:00.000Z");
  });

  it("bỏ trống giờ:phút thì mặc định 00:00 giờ Việt Nam", () => {
    expect(parseCutoff("23/11", nowIso)).toBe("2026-11-22T17:00:00.000Z");
  });

  it("trả về null khi ngày hoặc giờ không hợp lệ", () => {
    expect(parseCutoff("31/02 10:00", nowIso)).toBeNull();
    expect(parseCutoff("15/13 10:00", nowIso)).toBeNull();
    expect(parseCutoff("23/11 24:00", nowIso)).toBeNull();
    expect(parseCutoff("23/11 10:60", nowIso)).toBeNull();
  });

  it("trả về null khi chuỗi sai định dạng", () => {
    expect(parseCutoff("", nowIso)).toBeNull();
    expect(parseCutoff("2026-11-23", nowIso)).toBeNull();
    expect(parseCutoff("23/11 8", nowIso)).toBeNull();
  });
});
