import { describe, expect, it } from "vitest";
import { rpcError } from "./errors";

describe("rpcError", () => {
  it("giữ lời báo tiếng Việt của hàm SQL", () => {
    expect(
      rpcError({ code: "22023", message: "Người dùng đã ở Chi nhánh này" })
    ).toBe("Người dùng đã ở Chi nhánh này");
  });

  it("Quản trị cuối cùng và lỗi lạ dịch như admin-users", () => {
    expect(rpcError({ code: "P0001", hint: "last_admin" })).toBe(
      "Không thể bỏ hoặc khóa Quản trị cuối cùng"
    );
    expect(rpcError({ code: "XX000", message: "internal" })).toBe(
      "Không thực hiện được. Thử lại sau."
    );
    expect(rpcError(null)).toBeNull();
  });
});
