// Dựng bản web vào thư mục dist để đưa lên Cloudflare Pages.
// Vì sao không chạy thẳng `expo export`: Cloudflare Pages bỏ qua mọi thư mục tên "node_modules" khi upload,
// mà Expo đặt phông chữ ở dist/assets/node_modules/... → phông 404, web rơi về chữ có chân.
// Script này đổi tên thư mục đó thành "vendor" và sửa đường dẫn trong file đã dựng.
// Chạy: npm run build:web
import { execSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const FROM = "/assets/node_modules/";
const TO = "/assets/vendor/";

execSync(`npx expo export --platform web --output-dir ${DIST}`, {
  stdio: "inherit",
});

const from = join(DIST, "assets", "node_modules");
if (existsSync(from)) renameSync(from, join(DIST, "assets", "vendor"));

let changed = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|json|css)$/.test(name)) {
      const text = readFileSync(p, "utf8");
      if (text.includes(FROM)) {
        writeFileSync(p, text.split(FROM).join(TO));
        changed++;
      }
    }
  }
};
walk(DIST);

// Không được còn thư mục node_modules nào trong dist (Cloudflare sẽ bỏ qua).
const leftover = [];
const find = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name === "node_modules") leftover.push(p);
    else find(p);
  }
};
find(DIST);
if (leftover.length) {
  console.error("Còn thư mục node_modules trong dist:", leftover);
  process.exit(1);
}
console.log(
  `Xong: đã sửa đường dẫn phông ở ${changed} file. Cloudflare tự đưa lên mạng khi main đổi (xem docs/cai-dat.md).`
);
