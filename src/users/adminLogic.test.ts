import { describe, expect, it } from "vitest";
import {
  canActOn,
  deniedFor,
  messageForDbError,
  parseAdminRequest,
  validateNewUser,
} from "../../supabase/functions/admin-users/logic.ts";

const UID = "11111111-1111-4111-8111-111111111111";

describe("parseAdminRequest", () => {
  it("nhận đúng các action", () => {
    expect(parseAdminRequest({ action: "list" })).toEqual({
      ok: true,
      value: { action: "list" },
    });
    expect(
      parseAdminRequest({ action: "set_locked", user_id: UID, locked: true })
    ).toEqual({
      ok: true,
      value: { action: "set_locked", user_id: UID, locked: true },
    });
    expect(
      parseAdminRequest({ action: "set_admin", user_id: UID, is_admin: false })
    ).toEqual({
      ok: true,
      value: { action: "set_admin", user_id: UID, is_admin: false },
    });
  });

  it("create: trim + chữ thường email, kiểm mật khẩu", () => {
    expect(
      parseAdminRequest({
        action: "create",
        email: "  Nv@Example.Test ",
        password: "12345678",
        is_admin: false,
      })
    ).toEqual({
      ok: true,
      value: {
        action: "create",
        email: "nv@example.test",
        password: "12345678",
        is_admin: false,
      },
    });
    expect(
      parseAdminRequest({
        action: "create",
        email: "nv@example.test",
        password: "123",
        is_admin: false,
      })
    ).toEqual({ ok: false, error: "Mật khẩu ít nhất 8 ký tự" });
  });

  it("từ chối dữ liệu sai kiểu", () => {
    const bad = { ok: false, error: "Yêu cầu không hợp lệ" };
    expect(parseAdminRequest(null)).toEqual(bad);
    expect(parseAdminRequest({ action: "drop" })).toEqual(bad);
    expect(
      parseAdminRequest({ action: "set_locked", user_id: "x", locked: true })
    ).toEqual(bad);
    expect(
      parseAdminRequest({ action: "set_admin", user_id: UID, is_admin: "yes" })
    ).toEqual(bad);
    expect(
      parseAdminRequest({ action: "create", email: 1, password: "12345678" })
    ).toEqual(bad);
  });
});

describe("set_password", () => {
  it("nhận user_id hợp lệ và mật khẩu từ 8 ký tự (không cắt khoảng trắng)", () => {
    expect(
      parseAdminRequest({
        action: "set_password",
        user_id: UID,
        password: " 12345678 ",
      })
    ).toEqual({
      ok: true,
      value: { action: "set_password", user_id: UID, password: " 12345678 " },
    });
  });

  it("từ chối mật khẩu ngắn và dữ liệu sai", () => {
    expect(
      parseAdminRequest({
        action: "set_password",
        user_id: UID,
        password: "short",
      })
    ).toEqual({ ok: false, error: "Mật khẩu ít nhất 8 ký tự" });
    const bad = { ok: false, error: "Yêu cầu không hợp lệ" };
    expect(
      parseAdminRequest({
        action: "set_password",
        user_id: "x",
        password: "12345678",
      })
    ).toEqual(bad);
    expect(
      parseAdminRequest({
        action: "set_password",
        user_id: UID,
        password: 12345678,
      })
    ).toEqual(bad);
  });

  it("cho phép đặt lại cho chính mình và cho người khác", () => {
    const other = "22222222-2222-4222-8222-222222222222";
    expect(
      canActOn(UID, {
        action: "set_password",
        user_id: UID,
        password: "12345678",
      })
    ).toBeNull();
    expect(
      canActOn(UID, {
        action: "set_password",
        user_id: other,
        password: "12345678",
      })
    ).toBeNull();
  });
});

describe("validateNewUser", () => {
  it("báo lỗi email và mật khẩu", () => {
    expect(validateNewUser("abc", "short")).toEqual({
      email: "Email không hợp lệ",
      password: "Mật khẩu ít nhất 8 ký tự",
    });
    expect(validateNewUser("a@b.co", "12345678")).toEqual({});
  });
});

describe("canActOn", () => {
  it("không tự khóa / tự bỏ Quản trị", () => {
    expect(
      canActOn(UID, { action: "set_locked", user_id: UID, locked: true })
    ).toBe("Không thể tự khóa chính mình");
    expect(
      canActOn(UID, { action: "set_admin", user_id: UID, is_admin: false })
    ).toBe("Không thể tự bỏ quyền Quản trị của mình");
  });

  it("cho phép thao tác lên người khác", () => {
    const other = "22222222-2222-4222-8222-222222222222";
    expect(
      canActOn(UID, { action: "set_locked", user_id: other, locked: true })
    ).toBeNull();
    expect(canActOn(UID, { action: "list" })).toBeNull();
  });
});

describe("branch_id và list_all", () => {
  const BR = "33333333-3333-4333-8333-333333333333";
  it("list/create nhận branch_id tùy chọn, list_all không tham số", () => {
    expect(parseAdminRequest({ action: "list", branch_id: BR })).toEqual({
      ok: true,
      value: { action: "list", branch_id: BR },
    });
    expect(
      parseAdminRequest({
        action: "create",
        email: "nv@example.test",
        password: "12345678",
        is_admin: false,
        branch_id: BR,
      })
    ).toEqual({
      ok: true,
      value: {
        action: "create",
        email: "nv@example.test",
        password: "12345678",
        is_admin: false,
        branch_id: BR,
      },
    });
    expect(parseAdminRequest({ action: "list_all" })).toEqual({
      ok: true,
      value: { action: "list_all" },
    });
  });

  it("từ chối branch_id sai", () => {
    const bad = { ok: false, error: "Yêu cầu không hợp lệ" };
    expect(parseAdminRequest({ action: "list", branch_id: "x" })).toEqual(bad);
    expect(parseAdminRequest({ action: "list", branch_id: 1 })).toEqual(bad);
  });
});

describe("deniedFor", () => {
  const OWNER_ONLY = "Chỉ Quản trị cấp cao làm được việc này";
  const create = (is_admin: boolean) =>
    ({
      action: "create",
      email: "nv@example.test",
      password: "12345678",
      is_admin,
    }) as const;

  it("Quản trị quán: không cấp Quản trị, không xem mọi quán, không tạo Quản trị", () => {
    expect(
      deniedFor("branch_admin", {
        action: "set_admin",
        user_id: UID,
        is_admin: true,
      })
    ).toBe(OWNER_ONLY);
    expect(deniedFor("branch_admin", { action: "list_all" })).toBe(OWNER_ONLY);
    expect(deniedFor("branch_admin", create(true))).toBe(OWNER_ONLY);
    expect(deniedFor("branch_admin", create(false))).toBeNull();
    expect(deniedFor("branch_admin", { action: "list" })).toBeNull();
  });

  it("Quản trị quán chỉ thao tác lên Nhân viên", () => {
    const lock = { action: "set_locked", user_id: UID, locked: true } as const;
    expect(deniedFor("branch_admin", lock, true)).toBe(
      "Quản trị quán chỉ quản lý được Nhân viên"
    );
    expect(deniedFor("branch_admin", lock, false)).toBeNull();
  });

  it("Quản trị cấp cao làm được hết", () => {
    expect(
      deniedFor(
        "owner",
        { action: "set_admin", user_id: UID, is_admin: true },
        false
      )
    ).toBeNull();
    expect(deniedFor("owner", { action: "list_all" })).toBeNull();
    expect(deniedFor("owner", create(true))).toBeNull();
    expect(
      deniedFor(
        "owner",
        { action: "set_locked", user_id: UID, locked: true },
        true
      )
    ).toBeNull();
  });
});

describe("messageForDbError", () => {
  it("dịch lỗi database", () => {
    expect(messageForDbError({ code: "P0001", hint: "last_admin" })).toBe(
      "Không thể bỏ hoặc khóa Quản trị cuối cùng"
    );
    expect(messageForDbError({ code: "23505" })).toBe(
      "Người dùng đã thuộc Chi nhánh"
    );
    expect(messageForDbError({ code: "XX000" })).toBe(
      "Không thực hiện được. Thử lại sau."
    );
  });
});
