// Gộp loạt gọi liên tiếp thành một lần chạy sau `ms` (ví dụ nhiều sự kiện realtime → một lần tải lại).
export function debounce(fn: () => void, ms = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
  call.cancel = () => clearTimeout(timer);
  return call;
}
