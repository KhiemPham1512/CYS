import { useEffect, useState } from "react";

// Giờ hiện tại (ISO), tự cập nhật mỗi phút để các mốc theo giờ (như reset 7h sáng) tự đổi khi màn hình mở.
export function useNow(): string {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
