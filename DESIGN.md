# DESIGN.md: hướng giao diện CYS

Viết lại từ code đang chạy (`src/theme/themes.ts`, `src/ui/motion.ts`, các màn web admin). Đây là dữ liệu thiết kế, sửa ở code thì sửa luôn ở đây.

## Ai dùng, ở đâu

- **App điện thoại:** nhân viên quán đồ uống ghi dùng, kiểm kho, nhận hàng giữa giờ làm, tay ướt, ánh sáng quầy. Cần chữ to, nút to (tối thiểu 44px), một việc một màn.
- **Web admin:** Quản trị quán và Quản trị cấp cao ngồi máy tính (đôi khi điện thoại) để quản lý Người dùng, Danh mục, Nhật ký, nhiều Chi nhánh. Cần đọc nhanh bảng, ít bấm.

## Tính cách

Ấm, gọn, thân thiện như sổ tay của quán; không "công nghệ", không lạnh. Chủ đề mặc định **Hồng nơ** (màu và nơ là dấu nhận diện của quán), đổi được sang **Xanh trắng** trên từng máy.

Dial: ENERGY 1 / RHYTHM 1 / MOTION 1 (công cụ làm việc hằng ngày: yên, đều, chỉ chuyển cảnh ngắn có lý do).

## Màu (giữ 1 màu nhấn + trạng thái)

| Vai trò         | Hồng nơ           | Xanh trắng        | Dùng cho                                  |
| --------------- | ----------------- | ----------------- | ----------------------------------------- |
| `bg`            | #FFF5F8           | #F5F8FC           | nền trang                                 |
| `surface`       | #FFFFFF           | #FFFFFF           | thẻ, ô nhập                               |
| `line`          | #F6D3E0           | #DCE5F0           | viền, kẻ bảng                             |
| `accent`        | #E0508A           | #1D6FE0           | tab/mục đang chọn, viền ô đang gõ         |
| `accentDeep`    | #BE356B           | #1450B0           | nút chính, chữ nút viền                   |
| `accentSoft`    | #FDE6EF           | #E8F1FD           | nền mục đang chọn, đầu bảng, nhãn vai trò |
| `ink` / `muted` | #4A2235 / #8A5A6E | #102A43 / #5A6E87 | chữ chính / phụ                           |

Trạng thái dùng chung hai chủ đề: đỏ #B83232 (nền #FCE9E9) cho khóa, lỗi, xóa; vàng #8F530A cho cảnh báo; xanh lá #146F4D cho đã xong. Dải màu `gradFrom → gradTo` chỉ dùng cho logo.

## Chữ

Be Vietnam Pro (400/500/600/700): thiết kế cho tiếng Việt, dấu không chồng nhau ở cỡ nhỏ. Tiêu đề trang 24/700, tiêu đề thẻ 18/700, chữ thường 16, nhãn đầu bảng 11/700 chữ hoa (chỉ ở đầu bảng, để tách khỏi dữ liệu).

## Hình khối

- Bo góc: 8 cho nút và ô nhập, 16 cho thẻ/bảng, 20 cho hộp xác nhận. Không bo tròn kiểu viên thuốc.
- Không đổ bóng; tách lớp bằng viền `line` và nền `surface` trên `bg`.
- Nút chính: nền `accentDeep`, chữ trắng. Nút phụ: viền `accentDeep`, chữ `accentDeep`. Nút nguy hiểm trong hộp xác nhận: nền đỏ.

## Web admin

- Khung: thanh bên trái (≥ 900px) gồm logo + "Quản trị" + tên quán đang xem, danh sách trang, tài khoản và Đăng xuất ở đáy; hẹp hơn thì thanh trên với hàng tab cuộn ngang. Mục đang chọn: nền `accentSoft` + chữ `accentDeep` đậm (không chỉ đổi màu).
- Bảng: đầu bảng nền `accentSoft`, dòng cách nhau bằng kẻ `line`; hẹp thì thành danh sách thẻ. Form đi cạnh bảng chỉ khi còn đủ chỗ cho bảng, không thì xuống dưới.
- Mỗi màn có trạng thái đang tải (`Loading`), lỗi (nêu lý do + nút Thử lại), rỗng (nói vì sao rỗng).

## Chuyển động

Màn mới: mờ dần + trượt nhẹ 180–220ms; giảm chuyển động thì chỉ mờ. Không có hiệu ứng lặp.

## Dấu nhận diện

Logo lục giác có dải hồng và chiếc nơ cạnh logo ở chủ đề Hồng nơ (màn đăng nhập, Menu). Nhãn vai trò dạng ô chữ nền `accentSoft` bo 6.
