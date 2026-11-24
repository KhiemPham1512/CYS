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
Khoảng thời gian một Nguyên vật liệu dùng được kể từ Ngày sản xuất, ghi bằng ngày hoặc tháng đúng như trên bảng hạn (không quy đổi); ngày hết hạn của một Lô = Ngày sản xuất + Thời hạn sử dụng (tháng tính theo lịch; hạn theo ngày tính cả ngày sản xuất, ví dụ 30 ngày từ 18/11 dùng được đến hết 17/12).
_Tránh_: HSD, shelf life

**Lô**:
Phần Tồn kho thực tế của một Nguyên vật liệu có cùng Ngày sản xuất (phần chưa có Ngày sản xuất tách theo ngày vào kho để Thêm Ngày sản xuất cho đúng đợt); Tồn kho thực tế là tổng các Lô. Ghi dùng trừ Lô có Ngày sản xuất sớm nhất trước.
_Tránh_: batch, mẻ

**Chưa kiểm**:
Nhãn trên một Nguyên vật liệu chưa được Kiểm kho kể từ 7h sáng giờ Việt Nam gần nhất. Ghi dùng không bỏ nhãn; chỉ Kiểm kho (lưu số đếm) mới bỏ, đến 7h sáng hôm sau nhãn hiện lại. Nhãn giúp người kiểm kho đối chiếu thủ công, không thay thế Kiểm kho. Món bật **Không cần kiểm kho** (ngừng bán) không bao giờ mang nhãn này nhưng vẫn hiện ở Tồn kho và tờ giấy.
_Tránh_: chưa đếm

**Số lượng hiện như đã nhập**:
Ở Tồn kho, Kiểm kho, Ghi dùng, số lượng không tự gộp lên thùng: nhập "6" thì hiện "6 bình", nhập "1T+3" thì hiện "1 thùng 3 cây". Khi số đã đổi (Ghi dùng, Nhận hàng...) thì hiện đơn vị lẻ. Màn đặt hàng và nhận hàng vẫn hiện theo thùng.

**Đang dùng**:
Đơn vị đã khui của một Nguyên vật liệu có hạn sau khi khui dài (hơn 7 ngày), được theo dõi để biết còn dùng được đến ngày nào. Mỗi lần Ghi dùng thêm một đơn vị (ngày khui = hôm nay); có thể khui sẵn nhiều đơn vị cùng lúc; Người dùng bấm "Hết" khi dùng xong đơn vị đó.
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

**Nhận hàng**:
Lần một Người dùng ghi nhận hàng của một dòng Đơn đặt hàng đã về: phần nhận tốt vào Tồn kho thực tế thành Lô theo Ngày sản xuất, phần Hàng thiếu và Trả hàng hư vào Chờ nhà cung cấp. Mỗi dòng nhận một lần và hết Hàng đang về.
Màn Nhận hàng chia theo **Ngày của đơn** rồi theo Nhóm ("Nhóm · Đơn ngày 24/11"): hàng của đơn ngày nào nhận ở khối ngày đó, không gộp đơn khác ngày; chỉ đơn cùng ngày, cùng Nhóm mới gộp dòng cùng món.
_Tránh_: nhập kho, nhập hàng

**Đối chiếu đơn nhà cung cấp**:
So ảnh chụp đơn của nhà cung cấp với Đơn đặt hàng đã đặt trong app để báo chỗ lệch (ít hơn, nhiều hơn, thiếu món, ngoài đơn) hoặc "đã ổn"; chỉ kiểm tra, không sửa Đơn đặt hàng. Đơn đã đặt vẫn là Hàng đang về.
_Tránh_: nhập đơn từ ảnh, đồng bộ đơn

**Hạn mức đọc ảnh**:
Số ảnh đơn nhà cung cấp mỗi Người dùng được gửi đọc trong một ngày (giờ Việt Nam) ở một Chi nhánh; hết thì chọn "Đã đặt đúng như đơn" hoặc đợi ngày mai.
_Tránh_: quota, rate limit

**Tên nhà cung cấp**:
Cách nhà cung cấp gọi một Nguyên vật liệu trên đơn của họ (kèm tên Trung, mô tả quy cách như "12 lon/thùng"); tên lạ chưa khớp thì hỏi một lần rồi nhớ cho các lần sau.
_Tránh_: tên ngoài, alias

**Nhận bù**:
Lần nhận phần hàng nhà cung cấp còn nợ trong Chờ nhà cung cấp (nhận một phần cũng được); phần nhận vào Tồn kho thực tế thành Lô, phần còn lại tiếp tục chờ.
_Tránh_: giao bù, đền hàng

**Ghi dùng**:
Lần một Người dùng khai báo các Nguyên vật liệu đã lấy ra dùng và số lượng; Tồn kho thực tế bị trừ tương ứng.
_Tránh_: xuất kho, tiêu thụ, lấy hàng

**Hủy Ghi dùng**:
Lần một Người dùng gỡ một Ghi dùng đã ghi nhầm, chỉ trong ngày ghi; Tồn kho thực tế được hoàn lại và lần hủy vẫn được lưu lại. Sửa một Ghi dùng là hủy rồi ghi số mới.
_Tránh_: xóa Ghi dùng, hoàn tác

**Điều chỉnh tồn kho**:
Lần một Người dùng đặt lại Tồn kho thực tế của một Nguyên vật liệu về số thực tế, có thể kèm lý do. Ngày sản xuất của các Lô được giữ: phần tăng vào phần chưa có Ngày sản xuất, phần giảm trừ Lô có Ngày sản xuất sớm nhất trước (Kiểm kho cũng vậy).
_Tránh_: sửa kho, cân kho

**Kiểm kho**:
Lần đếm thực tế nhiều Nguyên vật liệu trên app, chỉ làm khi cần (không bắt buộc hằng ngày); mỗi số đếm là một Điều chỉnh tồn kho.
_Tránh_: kiểm kê, inventory count

**Đơn đặt hàng**:
Danh sách Nguyên vật liệu và số lượng quản lý muốn đặt, lập trong app để xuất ảnh gửi cho người đặt hàng.
_Tránh_: đề xuất đặt hàng, phiếu đặt, order

**Ngày của đơn**:
Ngày mà một Đơn đặt hàng thuộc về: đặt trước khi Kiểm kho trong ngày thì là đơn hôm nay, đặt sau khi đã Kiểm kho thì là đơn ngày mai. Ảnh của ngày D gồm Đặt hàng = các đơn ngày D, Tồn kho = Hàng đang về của các đơn trước ngày D cộng Tồn kho thực tế.
_Tránh_: ngày đặt (giờ bấm), ngày giao

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

**Hồ sơ cá nhân**:
Tên hiển thị và ảnh đại diện mà mỗi Người dùng tự sửa ở Menu; người cùng Chi nhánh thấy tên đó thay cho email ở Ghi dùng và Chế độ phát triển, để trống thì hiện email.
_Tránh_: profile, avatar, tài khoản (khi nói riêng tên và ảnh)

**Chế độ phát triển**:
Chế độ dành riêng cho Quản trị, bật bằng cách bấm 10 lần vào logo ở tab Tồn kho để mở các thao tác sửa lỗi dữ liệu nâng cao (Quay lại sổ kho, Xóa dữ liệu phát sinh); chỉ tồn tại trong phiên đang mở và tự tắt khi tắt app.
_Tránh_: dev mode, debug mode, chế độ thử nghiệm

**Quay lại sổ kho**:
Thao tác trong Chế độ phát triển giúp Quản trị hủy các dòng Kiểm kho, Điều chỉnh tồn kho, Thêm Ngày sản xuất và Ghi dùng từ một mốc giờ đã chọn (có thể lọc chỉ của một Người dùng), không gồm Nhận hàng và Trả hàng hư; vì sổ kho chỉ ghi thêm nên lần quay lại này có thể khôi phục được.
_Tránh_: rollback, hoàn tác kho, tua lại kho

**Xóa dữ liệu phát sinh**:
Thao tác trong Chế độ phát triển giúp Quản trị xóa toàn bộ sổ kho, Đơn đặt hàng, Nhận hàng, Hàng thiếu, Đang dùng, lượt đọc ảnh và Nhật ký thay đổi của Chi nhánh (giữ lại Danh mục, thành viên và dữ liệu in); phải gõ đúng tên Chi nhánh để xác nhận.
_Tránh_: reset, wipe, xóa trắng kho
