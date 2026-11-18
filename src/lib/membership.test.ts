import { describe, expect, it } from "vitest";
import { membershipStatus } from "./membership";

describe("membershipStatus", () => {
  it("đọc được dòng thành viên → còn hoạt động", () => {
    expect(membershipStatus({ data: { user_id: "u" }, error: null })).toBe(
      "active"
    );
  });

  it("RLS giấu dòng (bị khóa hoặc bị gỡ khỏi Chi nhánh) → locked", () => {
    expect(membershipStatus({ data: null, error: null })).toBe("locked");
  });

  it("lỗi mạng/máy chủ → unknown, không được đăng xuất nhầm", () => {
    expect(
      membershipStatus({ data: null, error: { message: "fetch failed" } })
    ).toBe("unknown");
  });
});
