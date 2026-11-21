import { useRef, useState } from "react";

// Chống lưu hai lần: `busy` đổi ngay (trước khi state kịp cập nhật), `saving` để vô hiệu nút.
// runSave bỏ qua khi mất mạng hoặc đang lưu.
export function useSaveGuard(online: boolean) {
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  async function runSave(action: () => Promise<void>) {
    if (!online || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await action();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return { saving, busy, runSave };
}
