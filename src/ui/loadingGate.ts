// Đếm các màn đang tải để màn chờ mở app đứng đợi, mờ thẳng vào nội dung thay vì nối sang màn "Đang tải".
const SETTLE_MS = 150; // một màn tắt rồi màn khác bật trong cùng lần vẽ: chưa tính là xong

let pending = 0;
const listeners = new Set<() => void>();

export function loadingStarted(): () => void {
  pending++;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    pending--;
    listeners.forEach((l) => l());
  };
}

// Gọi done một lần khi không còn màn nào tải (ổn định SETTLE_MS), hoặc khi quá maxMs.
export function whenIdle(done: () => void, maxMs: number): () => void {
  let fired = false;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    if (fired) return;
    fired = true;
    cleanup();
  };
  const check = () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (pending === 0) {
        fire();
        done();
      }
    }, SETTLE_MS);
  };
  const cap = setTimeout(() => {
    fire();
    done();
  }, maxMs);
  function cleanup() {
    clearTimeout(settle);
    clearTimeout(cap);
    listeners.delete(check);
  }
  listeners.add(check);
  check();
  return () => {
    fired = true;
    cleanup();
  };
}
