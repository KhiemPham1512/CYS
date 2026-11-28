# Một Chi nhánh gốc giữ Danh mục, các Chi nhánh khác tự theo bằng trigger

Các quán bán cùng thực đơn nên Danh mục phải giống nhau; sửa tay từng quán dễ lệch. Quyết định: bảng `branches` có cột `catalog_source` trỏ tới Chi nhánh gốc; mỗi Nhóm và món ở Chi nhánh theo có `source_id` trỏ tới dòng gốc. Trigger sau mỗi thêm/sửa ở Chi nhánh gốc ghi lại (upsert theo `source_id`) vào mọi Chi nhánh theo: Nhóm, món với mọi ô Danh mục (kể cả ẩn, sắp xếp, Ngừng kiểm, dữ liệu in) và Tên nhà cung cấp. Ở Chi nhánh theo, Danh mục và Tên nhà cung cấp chỉ đọc với mọi Người dùng, cả Quản trị cấp cao: trigger chặn ghi khi có `auth.uid()` và không phải ghi từ trigger đồng bộ (`pg_trigger_depth() = 1`). Tạo Chi nhánh mới thì chép kèm nối và đặt theo Chi nhánh gốc (mẫu là Chi nhánh theo thì theo thẳng gốc, không theo chuỗi). Chi nhánh có sẵn nối bằng `private.link_catalog` theo tên, lệch thì dừng và liệt kê.

## Considered Options

- **Danh mục dùng chung một bộ dòng cho mọi Chi nhánh**: sổ kho, đơn, nhận hàng đều khóa ngoại `(branch_id, item_id)`; đổi sang dòng chung phải viết lại RLS và mọi bảng. Bỏ.
- **Đồng bộ ở app (client chép sang quán khác)**: client không có quyền ghi quán khác và dễ sót khi mất mạng. Bỏ.
- **Quán theo được có món riêng**: người dùng chốt không cần (26/11/2026).

## Consequences

- Không đồng bộ: tồn kho, đơn, nhận hàng, Nhật ký, Cài đặt (tên quán in trên ảnh xuất vẫn riêng).
- Món không bao giờ bị xóa (chỉ ẩn), nên không có nhánh đồng bộ xóa; món ẩn ở gốc thì quán theo cũng ẩn nhưng tồn kho cũ vẫn giữ.
- Đồng bộ chỉ chạy khi thêm/sửa; nếu sau này mở quyền xóa Nhóm/món/Tên nhà cung cấp thì phải thêm nhánh xóa, không thì quán theo lệch.
- Ghi không có `auth.uid()` (SQL Editor, service role) không bị chặn ở quán theo: dùng để sửa tay khi cần, sửa tay thì phải giữ khớp gốc. Quán theo lệch tên với gốc (do sửa tay) có thể làm lệnh sửa ở gốc lỗi trùng tên.
- `link_catalog` thay toàn bộ Tên nhà cung cấp của quán được nối bằng của gốc (không kiểm lệch như Nhóm/món).
- Chỉ một tầng: `link_catalog` và `create_branch` không tạo chuỗi quán theo quán theo.
- Thêm cột Danh mục mới cho `items` phải thêm vào `private.sync_item` và `public.create_branch`.
- Sửa ở gốc ghi Nhật ký cả ở quán theo (người sửa là người của quán gốc).
- Quán theo đọc đơn nhà cung cấp gặp tên lạ thì chọn món mỗi lần, không nhớ được; chỉ quán gốc dạy tên mới.
