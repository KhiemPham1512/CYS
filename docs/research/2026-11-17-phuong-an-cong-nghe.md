# Nghiên cứu phương án công nghệ CYS (2026-11-17)

Tiêu chí: 1 người phát triển, quy mô nhỏ (5–10 thiết bị, vài nghìn dòng dữ liệu), chạy trơn tru, ít tốn tài nguyên, chi phí ~0 đ, server không đặt trên máy cá nhân. Nguồn: tra cứu qua agy (Gemini Flash), các điểm quyết định được Claude kiểm lại trực tiếp trên tài liệu gốc (đánh dấu ✔).

## 1. Backend + realtime

|                  | Supabase Free                                               | Firebase Spark                                  | PocketBase                                 |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| Dữ liệu          | Postgres 500 MB                                             | Firestore 1 GiB, 50k đọc / 20k ghi mỗi ngày     | SQLite, theo máy chủ                       |
| Ảnh              | 1 GB (≤ 50 MB/file)                                         | 5 GB                                            | theo máy chủ                               |
| Realtime         | 200 kết nối đồng thời                                       | listener, không giới hạn cứng                   | SSE                                        |
| Hẹn giờ (cron)   | `pg_cron` + Edge Functions (500k lượt/tháng) — **miễn phí** | Scheduled Functions **cần gói Blaze** (gắn thẻ) | `cronAdd()`                                |
| Offline trên máy | không sẵn, cần thêm lớp cache                               | **có sẵn** trong SDK                            | không sẵn                                  |
| Bất lợi          | **tạm dừng sau 7 ngày không hoạt động**; Pro $25/tháng      | NoSQL, báo cáo/tổng hợp khó hơn                 | phải thuê VPS (~$4–5/tháng) và tự vận hành |

Nguồn: [Supabase Pricing](https://supabase.com/pricing), [Firebase Pricing](https://firebase.google.com/pricing), [PocketBase Docs](https://pocketbase.io/docs/), [PocketBase JS Cron](https://pocketbase.io/docs/js-cron/).

**Khuyến nghị: Supabase.** Dữ liệu kho có quan hệ (hàng, nhóm, lô HSD, phiếu nhập, kiểm kho), Postgres hợp cho báo cáo bằng SQL; cron + gửi báo cáo tự động nằm trong gói free. Rủi ro tạm dừng 7 ngày không xảy ra khi quán dùng hằng ngày. Offline: MVP chạy online, quyết định có cần hàng đợi offline hay không ở bước grill.

## 2. Framework app (iOS + Android + web admin)

- **Expo (React Native, kiến trúc mới, Hermes):** APK cơ sở nhẹ hơn; web admin ra DOM thật (chọn chữ, Ctrl+F, thư viện bảng npm); build iOS trên cloud từ Windows qua [EAS Build](https://docs.expo.dev/build/introduction/); cập nhật nóng qua [EAS Update](https://docs.expo.dev/eas-update/introduction/). Nguồn: [Expo Web](https://docs.expo.dev/workflow/web/), [RN New Architecture](https://reactnative.dev/docs/the-new-architecture/landing-page).
- **Flutter:** khởi động lạnh và FPS ổn định (AOT, Impeller), nhưng APK lớn hơn; Flutter Web vẽ lên canvas, bundle nặng, kém cho trang quản trị dạng bảng; iOS/OTA phải ghép Codemagic + Shorebird. Nguồn: [Impeller](https://docs.flutter.dev/perf/impeller), [Flutter Web](https://docs.flutter.dev/platform-integration/web).
- Chưa có số đo benchmark định lượng trên máy Android rẻ (agy hết lượt tra).

**Khuyến nghị: Expo + TypeScript**, một codebase cho cả 3 nền tảng; khớp với Husky/Prettier đã cài. Lưu ý: OCR native cần **Expo Dev Build** (không chạy trong Expo Go).

## 3. Scan ảnh: nhập hàng và hạn sử dụng (OCR)

- **ML Kit Text Recognition v2** (trên máy, offline, miễn phí): ✔ tiếng Việt được hỗ trợ (`vi`, chữ Latin) — [Languages](https://developers.google.com/ml-kit/vision/text-recognition/v2/languages). Thư viện RN: `@react-native-ml-kit/text-recognition` (cần Dev Build). Trả về chữ thô → tự tách ngày bằng regex (`dd/mm/yyyy`, `HSD`, `NSX`, `EXP`).
- **Google Cloud Vision:** 1.000 ảnh/tháng miễn phí, sau đó $1,50/1.000 ảnh; cũng chỉ trả chữ thô — [Pricing](https://cloud.google.com/vision/pricing).
- **Gemini API (vision):** đọc bao bì khó (lóa, cong) và trả JSON có cấu trúc (tự phân biệt NSX/HSD, tách danh sách hàng); có free tier (dữ liệu có thể được Google dùng), trả phí khoảng vài cent/1.000 ảnh theo token — [Gemini Pricing](https://ai.google.dev/pricing). Con số chi phí cần kiểm lại khi chọn model.

**Khuyến nghị:** ML Kit trên máy làm mặc định (nhanh, không tốn mạng/tiền), luôn có màn xác nhận/sửa tay sau khi scan; Gemini là phương án nâng cấp cho ảnh khó (gọi qua Edge Function để giấu khóa API).

## 4. Báo cáo tự động qua Zalo

- **Zalo Bot Platform** (chính thức, miễn phí): API kiểu Telegram, `sendMessage` (1–2.000 ký tự) và `sendPhoto`. ✔ `chat_id` là "ID của người nhận hoặc cuộc trò chuyện"; ✔ webhook có `chat_type: GROUP` — "cuộc hội thoại với nhóm (**Beta**)"; ✔ mỗi lần gửi tính vào **hạn mức tin nhắn hàng tháng** (tài liệu không ghi con số). Nguồn: [sendMessage](https://bot.zaloplatforms.com/docs/apis/sendMessage/), [Webhook](https://bot.zaloplatforms.com/docs/webhook/). Theo agy, bot lấy `chat_id` của nhóm khi thành viên @mention bot; một nguồn cộng đồng báo có bot không thêm được vào nhóm → **phải thử thật**.
- **Zalo OA + GMF:** gửi tin/ảnh vào nhóm do OA sở hữu (`/v3.0/oa/group/message`), cần OA xác thực và mua gói GMF — tốn phí, quá mức cho quán nhỏ. **ZNS** chỉ gửi 1-1 theo mẫu, không vào nhóm. Nguồn: [GMF](https://developers.zalo.me/docs/official-account/nhom-chat-gmf).
- **Thư viện không chính thức** (`zlapi`, `zca-js`, giả lập tài khoản cá nhân): vi phạm điều khoản, rủi ro khóa tài khoản → **loại**.

**Khuyến nghị:** MVP dùng **xuất ảnh + nút chia sẻ** sang Zalo (chắc chắn chạy). Song song làm **prototype Zalo Bot**: tạo bot, thêm vào nhóm thử, lấy `chat.id`, gửi tin + ảnh. Chạy được → Edge Function hẹn giờ gửi báo cáo tự động.

## 5. Xuất ảnh báo cáo tồn kho

- Trên máy (MVP): `react-native-view-shot` chụp bảng → `expo-sharing` mở bảng chia sẻ — [expo-sharing](https://docs.expo.dev/versions/latest/sdk/sharing/), [view-shot](https://github.com/gre/react-native-view-shot).
- Trên server (gửi tự động): Edge Function dùng `satori` + `resvg-wasm` tạo PNG — [OG image](https://supabase.com/docs/guides/functions/examples/og-image). Giới hạn: 256 MB RAM, **2 giây CPU**, 150 giây tổng (free); không dùng được `sharp` — [Limits](https://supabase.com/docs/guides/functions/limits). Ảnh bảng ~60 dòng có thể chạm 2 giây CPU → phương án rẻ hơn: gửi **bảng dạng chữ** qua `sendMessage` (60 dòng × ~25 ký tự ≈ 1.500 ký tự, vừa giới hạn 2.000).

## Tóm tắt phương án đề xuất

Expo (TypeScript) + Supabase (Postgres, Realtime, Auth, Storage, pg_cron, Edge Functions) + ML Kit OCR trên máy (Gemini dự phòng) + xuất ảnh/chia sẻ thủ công cho MVP, Zalo Bot cho báo cáo tự động sau khi prototype thành công. Chi phí dự kiến: 0 đ ở gói free; tài khoản Apple Developer (99 USD/năm) chỉ cần khi phát hành iOS qua App Store/TestFlight.

## Còn mở (chốt ở bước grill → ADR)

1. Có cần chạy offline (kho không có mạng) không.
2. Zalo Bot vào nhóm được không (prototype).
3. Số đo hiệu năng trên máy Android rẻ của nhân viên (đo khi có bản build đầu).
4. Phân phối iOS: TestFlight (cần tài khoản Apple trả phí) hay chỉ Android + web.
