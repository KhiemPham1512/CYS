# CYS — Quản lý kho

Theo dõi nguyên vật liệu của quán đồ uống: còn bao nhiêu, đã dùng gì, cần đặt gì.

## Ngôn ngữ

**Chi nhánh**:
Một quán có kho riêng. Hiện chỉ có một chi nhánh; mọi số liệu kho thuộc về đúng một chi nhánh.
_Tránh_: cửa hàng, store, điểm bán

**Nguyên vật liệu**:
Một loại hàng quán dùng để pha chế hoặc đóng gói, thuộc một Nhóm và có một Đơn vị tính.
_Tránh_: sản phẩm, hàng hóa, item

**Nhóm**:
Cách phân loại Nguyên vật liệu (ví dụ: Đóng gói, Thạch & Topping, Trà & Nước pha chế, NVL pha chế).
_Tránh_: danh mục con, category

**Danh mục**:
Toàn bộ Nguyên vật liệu mà một Chi nhánh quản lý.
_Tránh_: catalog, master data

**Đơn vị tính**:
Đơn vị dùng để đếm một Nguyên vật liệu (Thùng, Bao, Hộp, Kg…); mỗi Nguyên vật liệu có đúng một Đơn vị tính.
_Tránh_: ĐVT, unit

**Tồn kho thực tế**:
Số lượng đang thật sự có trong kho của một Nguyên vật liệu tại một Chi nhánh.
_Tránh_: tồn, stock, số dư

**Ngày sản xuất**:
Ngày sản xuất in trên hàng, do Người dùng nhập tay khi nhận hàng; bắt buộc với Nguyên vật liệu được đánh dấu cần theo dõi hạn.
_Tránh_: NSX, hạn sử dụng (khi ý nói ngày in trên bao bì)

**Thời hạn sử dụng**:
Khoảng thời gian một Nguyên vật liệu dùng được kể từ Ngày sản xuất, ghi bằng ngày hoặc tháng đúng như trên bảng hạn (không quy đổi); ngày hết hạn của một Lô = Ngày sản xuất + Thời hạn sử dụng (tháng tính theo lịch).
_Tránh_: HSD, shelf life

**Lô**:
Phần Tồn kho thực tế của một Nguyên vật liệu có cùng Ngày sản xuất (phần chưa có Ngày sản xuất tách theo ngày vào kho để Thêm Ngày sản xuất cho đúng đợt); Tồn kho thực tế là tổng các Lô. Ghi dùng trừ Lô có Ngày sản xuất sớm nhất trước.
_Tránh_: batch, mẻ

**Đang dùng**:
Đơn vị đã khui của một Nguyên vật liệu có hạn sau khi khui dài (hơn 7 ngày), được theo dõi để biết còn dùng được đến ngày nào.
_Tránh_: đang mở, đã khui

**Hàng đang về**:
Số lượng một Nguyên vật liệu đã được đặt với nhà cung cấp nhưng chưa nhận.
_Tránh_: hàng chờ, hàng đặt

**Tồn kho dự tính**:
Tồn kho thực tế cộng Hàng đang về; là con số báo cáo cho quản lý trước khi hàng về.
_Tránh_: tồn dự kiến, tồn ảo

**Chờ nhà cung cấp**:
Danh sách hàng nhà cung cấp còn nợ quán (Hàng thiếu hoặc Trả hàng hư), không tính vào Tồn kho thực tế hay Tồn kho dự tính cho tới khi nhận.
_Tránh_: hàng nợ, backorder

**Hàng thiếu**:
Phần hàng đã đặt nhưng nhà cung cấp giao thiếu, chờ giao bù.
_Tránh_: hàng còn thiếu, giao thiếu

**Trả hàng hư**:
Hàng bị hư (phát hiện lúc nhận hoặc sau khi đã vào kho) trả lại nhà cung cấp; luôn được đền bằng hàng tương đương.
_Tránh_: đổi hàng, hoàn hàng, return

**Ghi dùng**:
Lần một Người dùng khai báo các Nguyên vật liệu đã lấy ra dùng và số lượng; Tồn kho thực tế bị trừ tương ứng.
_Tránh_: xuất kho, tiêu thụ, lấy hàng

**Điều chỉnh tồn kho**:
Lần một Người dùng đặt lại Tồn kho thực tế của một Nguyên vật liệu về số thực tế, có thể kèm lý do. Ngày sản xuất của các Lô được giữ: phần tăng vào phần chưa có Ngày sản xuất, phần giảm trừ Lô có Ngày sản xuất sớm nhất trước (Kiểm kho cũng vậy).
_Tránh_: sửa kho, cân kho

**Kiểm kho**:
Lần đếm thực tế nhiều Nguyên vật liệu trên app, chỉ làm khi cần (không bắt buộc hằng ngày); mỗi số đếm là một Điều chỉnh tồn kho.
_Tránh_: kiểm kê, inventory count

**Đơn đặt hàng**:
Danh sách Nguyên vật liệu và số lượng quản lý muốn đặt, lập trong app để xuất ảnh gửi cho người đặt hàng.
_Tránh_: đề xuất đặt hàng, phiếu đặt, order

**Người đặt hàng**:
Người ngoài app nhận Đơn đặt hàng, đặt với nhà cung cấp rồi gửi ảnh đơn đã đặt vào nhóm Zalo.
_Tránh_: người mua, purchaser

**Người dùng**:
Người đăng nhập app, là thành viên của một Chi nhánh; mọi Người dùng có cùng quyền với dữ liệu kho. Người dùng bị khóa không đọc/ghi được gì.
_Tránh_: nhân viên, tài khoản, role

**Quản trị**:
Người dùng (chủ quán) có thêm quyền tạo/khóa Người dùng, sửa Cài đặt và xem Nhật ký thay đổi.
_Tránh_: admin, chủ, quản lý

**Cài đặt**:
Thông tin chung của một Chi nhánh do Quản trị đặt, ví dụ tên Chi nhánh in lên ảnh xuất.
_Tránh_: config, settings

**Nhật ký thay đổi**:
Bản ghi ai đã thay đổi gì, lúc nào, giá trị cũ và mới.
_Tránh_: log, lịch sử, audit
