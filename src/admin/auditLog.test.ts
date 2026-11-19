import { describe, expect, it } from "vitest";
import { describeChange, type AuditEntry } from "./auditLog";

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  table_name: "items",
  action: "update",
  old_data: null,
  new_data: null,
  ...over,
});

describe("describeChange", () => {
  it("món: chỉ nêu trường đổi, dạng 'Nhãn: cũ → mới'", () => {
    const lines = describeChange(
      entry({
        old_data: {
          name: "Hạt é",
          unit: "Gói",
          case_size: null,
          track_mfg_date: false,
        },
        new_data: {
          name: "Hạt é",
          unit: "Hộp",
          case_size: 12,
          track_mfg_date: true,
        },
      })
    );
    expect(lines).toEqual([
      "Đơn vị: Gói → Hộp",
      "Quy cách thùng: — → 12",
      "Theo dõi Ngày sản xuất: Không → Có",
    ]);
  });

  it("Thời hạn kèm đơn vị: '6 tháng → 15 ngày'", () => {
    const lines = describeChange(
      entry({
        old_data: { shelf_life: 6, shelf_life_unit: "month" },
        new_data: { shelf_life: 15, shelf_life_unit: "day" },
      })
    );
    expect(lines).toEqual(["Thời hạn: 6 tháng → 15 ngày"]);
  });

  it("bỏ trường kỹ thuật (updated_at) và không đổi thì không có dòng nào", () => {
    expect(
      describeChange(
        entry({
          old_data: { unit: "Gói", updated_at: "2026-11-18T01:00:00Z" },
          new_data: { unit: "Gói", updated_at: "2026-11-19T01:00:00Z" },
        })
      )
    ).toEqual([]);
  });

  it("thêm / xóa món nêu tên", () => {
    expect(
      describeChange(entry({ action: "insert", new_data: { name: "Cafe" } }))
    ).toEqual(["Thêm: Cafe"]);
    expect(
      describeChange(entry({ action: "delete", old_data: { name: "Cafe" } }))
    ).toEqual(["Xóa: Cafe"]);
  });

  it("thêm / xóa không có tên (tài khoản) thì nêu đối tượng", () => {
    expect(
      describeChange(
        entry({
          table_name: "members",
          action: "insert",
          new_data: { user_id: "u" },
        })
      )
    ).toEqual(["Thêm: tài khoản"]);
  });

  it("thành viên: khóa và quyền Quản trị", () => {
    expect(
      describeChange(
        entry({
          table_name: "members",
          old_data: { is_locked: false, is_admin: false },
          new_data: { is_locked: true, is_admin: true },
        })
      )
    ).toEqual(["Quyền Quản trị: Không → Có", "Khóa tài khoản: Không → Có"]);
  });

  it("biến động kho: nêu loại và số lượng", () => {
    expect(
      describeChange(
        entry({
          table_name: "stock_movements",
          action: "use",
          new_data: { qty: 2 },
        })
      )
    ).toEqual(["Ghi dùng: 2"]);
    expect(
      describeChange(
        entry({
          table_name: "stock_movements",
          action: "count",
          new_data: { qty: 7, expected_qty: 9 },
        })
      )
    ).toEqual(["Kiểm kho: 7 (sổ 9)"]);
  });
});
