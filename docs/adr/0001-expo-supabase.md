# Expo (TypeScript) + Supabase cho toàn bộ app

App cần chạy trên Android, iOS và web admin, có realtime nhiều thiết bị, server không đặt trên máy cá nhân, một người phát triển, chi phí ~0. Chọn Expo (React Native, TypeScript) cho cả ba nền tảng và Supabase (Postgres, Realtime, Auth, Storage, Edge Functions) làm backend. Chi tiết nghiên cứu: `docs/research/2026-11-17-phuong-an-cong-nghe.md`.

## Considered Options

- **Flutter + Firebase**: mượt hơn chút ở hoạt ảnh, nhưng Flutter Web vẽ canvas (kém cho web admin dạng bảng/nhật ký), Firestore NoSQL khó làm báo cáo, OTA/iOS build phải ghép dịch vụ ngoài.
- **Rust (Dioxus/Tauri mobile)**: hệ sinh thái UI di động còn non (camera, chia sẻ ảnh), không cần thiết khi backend đã là Supabase.
- **PocketBase**: phải thuê và tự vận hành VPS.

## Consequences

- Supabase gói free tạm dừng sau 7 ngày không hoạt động; quán dùng hằng ngày nên chấp nhận.
- Khóa AI (đọc ảnh) và khóa service role chỉ nằm trong Edge Function secrets.
