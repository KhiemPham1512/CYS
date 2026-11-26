# Quản trị cấp cao là bảng riêng, mỗi Người dùng thuộc đúng một Chi nhánh

Quán mở thêm Chi nhánh nên cần một người thấy mọi Chi nhánh, trong khi Nhân viên và Quản trị quán chỉ thấy Chi nhánh của mình. Quyết định: Quản trị cấp cao là một bảng riêng `private.owners` (client không đọc/ghi được), các hàm kiểm quyền chung `is_active_member(b)` và `is_branch_admin(b)` trả đúng thêm cho người trong bảng đó, nên mọi policy RLS và RPC hiện có tự mở cho Quản trị cấp cao mà không phải viết lại. Mỗi Người dùng có đúng một dòng `members` (unique `user_id`); Quản trị cấp cao vẫn giữ dòng `members` ở một Chi nhánh để app điện thoại chạy như cũ, chỉ web admin mới quản lý nhiều Chi nhánh.

## Considered Options

- **Cột `role` trên `members`**: một người nhiều dòng (mỗi Chi nhánh một dòng) thì vai trò cấp cao lặp ở mọi dòng và phải thêm dòng cho mỗi Chi nhánh mới; dễ lệch.
- **Cho một Người dùng làm thành viên nhiều Chi nhánh**: app điện thoại phải có chỗ chọn Chi nhánh và mọi màn phải biết Chi nhánh đang chọn; nhân viên thật không cần, nên bỏ.

## Consequences

- Kiểm "là Quản trị" phải luôn đi qua `private.is_branch_admin`; câu `exists (... members ... is_admin)` viết thẳng sẽ bỏ sót Quản trị cấp cao.
- Quản trị cấp cao đọc được mọi Chi nhánh, nên code nào lấy "Chi nhánh hiện tại" phải lấy từ dòng `members` của chính mình, không lấy dòng đầu của bảng.
- Quyền cấp cao không xét `members.is_locked`: chặn một Quản trị cấp cao bằng cách khóa đăng nhập (Auth ban, như Khóa Người dùng) hoặc xóa khỏi `private.owners`.
- `keep_last_admin` vẫn đếm Quản trị quán trong từng Chi nhánh; Quản trị cấp cao không tính thay.
