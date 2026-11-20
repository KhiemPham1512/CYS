# Cài đặt và phát hành CYS

Hướng dẫn gồm hai phần: **cho nhân viên** (cài app) và **cho người quản lý** (dựng bản mới, đưa web lên mạng).

## Cho nhân viên

### Điện thoại Android: cài file APK

1. Nhận file `cys-<phiên bản>.apk` từ Quản trị (Zalo, USB, hoặc link tải).
2. Mở file trên điện thoại. Nếu máy hỏi **Cho phép cài ứng dụng từ nguồn này**, bấm **Cài đặt** rồi bật cho trình duyệt hoặc Zalo đang mở file.
3. Bấm **Cài đặt**. Xong bấm **Mở**.
4. Đăng nhập bằng email và mật khẩu Quản trị đã gửi. Có thể đổi chủ đề ở Menu (≡) → Chủ đề.

Cập nhật bản mới: cài đè file APK mới, dữ liệu đăng nhập vẫn giữ.

### iPhone: dùng web qua Safari

1. Mở **Safari** (không dùng Chrome), vào địa chỉ web Quản trị gửi.
2. Bấm nút **Chia sẻ** (hình ô vuông có mũi tên lên) → **Thêm vào Màn hình chính** → **Thêm**.
3. Mở app **CYS** từ màn hình chính (chạy toàn màn hình như app thật). Đăng nhập như trên.

Lưu ý: cần có mạng để dùng. Khi mất mạng app báo ở đầu màn hình và không lưu được cho tới khi có mạng lại.

## Cho Quản trị

- Vào web bằng tài khoản Quản trị trên máy tính để thấy bảng điều khiển: Nhật ký thay đổi, Người dùng, Danh mục, Sửa hàng loạt.
- Tạo tài khoản cho nhân viên ở **Người dùng** → **Thêm Người dùng**, rồi gửi email và mật khẩu ban đầu cho họ.
- Nhân viên đăng nhập web (iPhone) thấy app đầy đủ như điện thoại; chỉ Quản trị mới thấy bảng điều khiển.

## Cho người dựng bản mới

Việc này làm trên máy có sẵn môi trường dự án (xem `CLAUDE.md`). Khóa ký và mật khẩu khóa **không nằm trong repo**, cất ở `D:\Keys\` (sao lưu thêm một bản an toàn: mất khóa thì bản sau không cài đè lên bản cũ được).

### Dựng APK

```powershell
# Từ thư mục gốc repo, PowerShell
.\scripts\build-apk.ps1
```

Kết quả: `.local-artifacts\release\cys-<phiên bản>.apk` (ký bằng khóa riêng, chỉ cho điện thoại arm64, tức mọi máy Android hiện nay). Cần file `.env` có `EXPO_PUBLIC_SUPABASE_URL` và `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Tăng `version` trong `app.json` trước khi dựng bản mới.

### Đưa web lên mạng (Cloudflare Pages)

```powershell
$env:npm_config_cache='D:\Cache\npm-cache'; $env:TEMP=$env:TMP='D:\Cache\tmp'
npx expo export --platform web --output-dir dist
npx wrangler pages deploy dist --project-name cys
```

Lần đầu `wrangler` mở trình duyệt để đăng nhập Cloudflare. Địa chỉ công khai có dạng `https://cys.pages.dev`. Bản web chỉ chứa khóa công khai của Supabase (dữ liệu được RLS bảo vệ), không chứa khóa bí mật.

### Danh mục

Danh mục thật nạp bằng script chạy trên máy (`npm run import-catalog`, xem `scripts/import-catalog.ts`) hoặc sửa trực tiếp ở mục Danh mục trên web. Dữ liệu thật không được đưa vào repo.

### Rủi ro đã chấp nhận: mật khẩu bị lộ

Tính năng **Leaked password protection** của Supabase (chặn mật khẩu từng bị lộ) chỉ có ở gói Pro, nên dự án đang bỏ qua. Hệ quả:

- Mật khẩu Quản trị đặt cho nhân viên không được kiểm với danh sách mật khẩu đã lộ.
- Quản trị đặt mật khẩu ban đầu đủ mạnh (không dùng dãy số, không dùng tên quán), và yêu cầu nhân viên tự đổi sau lần đăng nhập đầu tiên.
- Nếu nâng lên gói Pro sau này, bật lại tính năng này trong Supabase Dashboard → Authentication → Password security.
