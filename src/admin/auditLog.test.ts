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

  it("Theo dõi Đang dùng: null hiển thị 'Tự động', true/false hiển thị 'Có'/'Không'", () => {
    expect(
      describeChange(
        entry({
          old_data: { track_in_use: null },
          new_data: { track_in_use: true },
        })
      )
    ).toEqual(["Theo dõi Đang dùng: Tự động → Có"]);
    expect(
      describeChange(
        entry({
          old_data: { track_in_use: true },
          new_data: { track_in_use: false },
        })
      )
    ).toEqual(["Theo dõi Đang dùng: Có → Không"]);
    expect(
      describeChange(
        entry({
          old_data: { track_in_use: false },
          new_data: { track_in_use: null },
        })
      )
    ).toEqual(["Theo dõi Đang dùng: Không → Tự động"]);
  });

  it("trường bật/tắt khác thiếu giá trị vẫn hiện 'Không' (chỉ Theo dõi Đang dùng có 'Tự động')", () => {
    expect(
      describeChange(
        entry({
          old_data: { skip_count: undefined },
          new_data: { skip_count: true },
        })
      )
    ).toEqual(["Không cần kiểm kho: Không → Có"]);
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

  it("đổi dữ liệu in trên tờ: một dòng 'đã đổi' (không phơi nội dung), kể cả khi chỉ đổi cột này", () => {
    expect(
      describeChange(
        entry({
          table_name: "items",
          action: "update",
          old_data: { name: "A", sheet: {} },
          new_data: { name: "A", sheet: { zh: "中" } },
        })
      )
    ).toEqual(["Dữ liệu in trên tờ: đã đổi"]);
    expect(
      describeChange(
        entry({
          table_name: "items",
          action: "update",
          old_data: { name: "A", sheet: { zh: "中" } },
          new_data: { name: "A", sheet: { zh: "中" } },
        })
      )
    ).toEqual([]);
  });

  it("hủy dòng do quay lại sổ kho khác với hủy Ghi dùng thường", () => {
    expect(
      describeChange(
        entry({
          table_name: "stock_movements",
          action: "void",
          new_data: { qty: 0, note: "rollback" },
        })
      )
    ).toEqual(["Quay lại sổ kho: hủy 1 dòng"]);
    expect(
      describeChange(
        entry({
          table_name: "stock_movements",
          action: "void",
          new_data: { qty: 2 },
        })
      )
    ).toEqual(["Hủy Ghi dùng: 2"]);
  });

  it("sự kiện quay lại sổ kho, khôi phục và xóa dữ liệu phát sinh", () => {
    expect(
      describeChange(
        entry({
          table_name: "stock_rollback",
          action: "insert",
          new_data: { since: "2026-11-20T07:05:00Z", count: 4 },
        })
      )
    ).toEqual(["Quay lại sổ kho từ 20/11 14:05: 4 dòng"]);
    expect(
      describeChange(
        entry({
          table_name: "stock_rollback",
          action: "delete",
          old_data: { count: 4 },
        })
      )
    ).toEqual(["Khôi phục lần quay lại: 4 dòng"]);
    expect(
      describeChange(
        entry({
          table_name: "branch_reset",
          action: "delete",
        })
      )
    ).toEqual(["Xóa dữ liệu phát sinh của Chi nhánh"]);
  });

  it("xóa món khỏi đơn đã đặt ghi số lượng đã xóa", () => {
    expect(
      describeChange(
        entry({
          table_name: "purchase_order_lines",
          action: "delete",
          old_data: { qty: 4 },
        })
      )
    ).toEqual(["Xóa khỏi đơn đã đặt: 4"]);
  });

  it("gỡ nhận hàng ghi số đã nhận bị gỡ", () => {
    expect(
      describeChange(
        entry({
          table_name: "purchase_receipts",
          action: "delete",
          old_data: { good_qty: 6 },
        })
      )
    ).toEqual(["Gỡ nhận hàng: 6"]);
  });
});

describe("describeChange: nhiều Chi nhánh", () => {
  it("tạo Chi nhánh ghi tên quán mới", () => {
    expect(
      describeChange(
        entry({
          table_name: "branches",
          action: "insert",
          new_data: { branch_name: "Quán Mẫu 2", template: "x" },
        })
      )
    ).toEqual(["Tạo Chi nhánh: Quán Mẫu 2"]);
  });

  it("quán cũ thấy người rời đi khi Chuyển quán", () => {
    expect(
      describeChange(
        entry({
          table_name: "members",
          action: "delete",
          old_data: { user_id: "u", branch_id: "a", moved_to: "b" },
        })
      )
    ).toEqual(["Chuyển tài khoản sang Chi nhánh khác"]);
  });

  it("quán mới thấy người chuyển đến (và mất quyền Quản trị nếu có)", () => {
    expect(
      describeChange(
        entry({
          table_name: "members",
          action: "update",
          old_data: { branch_id: "a", is_admin: true, is_locked: false },
          new_data: { branch_id: "b", is_admin: false, is_locked: false },
        })
      )
    ).toEqual([
      "Chuyển tài khoản đến Chi nhánh này",
      "Quyền Quản trị: Có → Không",
    ]);
  });
});
