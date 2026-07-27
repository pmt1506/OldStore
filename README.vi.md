# OldStore

*[English](README.md) | Tiếng Việt*

Công cụ cá nhân: nhập link App Store → tra cứu ra **bundle ID**, đăng nhập Apple ID để **lấy license** (mua $0 cho app miễn phí), tải file **IPA** về và lưu trữ lại — kể cả **phiên bản cũ hơn** để cài lên các thiết bị iOS đời thấp không còn nhận được bản mới nhất từ App Store.

Đây là bản rút gọn, tự viết lại dựa trên việc phân tích kiến trúc của [AssppWeb](https://github.com/Lakr233/AssppWeb) (chính nó dựa trên [ipatool](https://github.com/majd/ipatool) và [Asspp](https://github.com/Lakr233/Asspp)) — bỏ bớt phần kiến trúc "zero-trust" WASM/Wisp (chỉ cần thiết khi host công khai cho nhiều người dùng không tin cậy lẫn nhau), tính năng cài đặt qua `itms-services://`, và chunked/resumable download đa luồng — vì mục tiêu ở đây chỉ là: **tra cứu bundle ID + lấy license + tải & lưu IPA** cho một người dùng tự host trên máy/server của chính mình.

## Nó hoạt động thế nào (kỹ thuật)

Apple có một bộ API riêng tư ("StoreAPI") mà chính Apple Configurator / iTunes cũ dùng để đồng bộ app xuống thiết bị:

1. **Bag** (`init.itunes.apple.com/bag.xml`) — trả về danh sách endpoint hiện hành (auth URL...).
2. **Auth** (`auth.itunes.apple.com/auth/v1/native/fast/`) — đăng nhập bằng Apple ID + mật khẩu (plist request), trả về `passwordToken` + DSID. Nếu tài khoản bật 2FA, Apple trả lỗi đặc biệt yêu cầu mã 6 số, gửi lại `password + code`.
3. **Buy** (`buy.itunes.apple.com/.../buyProduct`) — "mua" app với giá 0đ. Đây chính là bước **lấy license**: nếu không làm bước này, bước tải sẽ bị Apple từ chối với `failureType 9610` (chưa có license) đối với app tài khoản chưa từng sở hữu.
4. **Download** (`p25-buy.itunes.apple.com/.../volumeStoreDownloadProduct`) — trả về URL CDN đã ký (`*.apple.com`) để tải file `.ipa`, kèm theo các khối **SINF** (chữ ký FairPlay license) và metadata phiên bản. Có thể truyền `externalVersionId` để lấy một **bản build cũ hơn** — đây là cơ chế để nhắm tới thiết bị iOS đời thấp, vì App Store công khai chỉ cho tải bản mới nhất (thường yêu cầu iOS cao).
5. File `.ipa` tải về từ CDN **chưa có license** — server sẽ tự mở file zip, chèn (các) SINF + `iTunesMetadata.plist` vào đúng vị trí (`SC_Info/...`) rồi lưu lại. IPA vẫn được mã hoá FairPlay như bình thường (không có công đoạn nào bẻ khoá DRM ở đây); SINF chỉ là "giấy phép" chứng minh tài khoản Apple ID có quyền sở hữu app đó.

Việc tra cứu bundle ID dùng API công khai `itunes.apple.com/lookup`, không cần đăng nhập.

## Hai cách chạy: Docker (đầy đủ) hoặc Vercel (giới hạn)

App có hai chế độ, tự nhận diện qua biến môi trường `VERCEL` mà Vercel tự set:

| | **Self-host (Docker / `npm start`)** | **Vercel (serverless)** |
| --- | --- | --- |
| Tra cứu bundle ID | ✅ | ✅ |
| Đăng nhập lưu phiên (nhiều tài khoản) | ✅ | ❌ |
| Lấy license | ✅ | ✅ (1 request đăng nhập + lấy license luôn, không lưu phiên) |
| Xem/chọn phiên bản cũ | ✅ | ❌ |
| Tải & lưu trữ file IPA | ✅ | ❌ |

**Lý do Vercel không thể tải & lưu IPA:** serverless function của Vercel (a) không có ổ đĩa bền vững — mỗi lần chạy có thể là một container khác, ghi ra `/tmp` sẽ mất ngay sau request; (b) giới hạn cứng dung lượng response của 1 function là **~4.5MB**, trong khi IPA thường 50MB–2GB. Đây là giới hạn nền tảng, không phải do code viết thiếu — nên thay vì giả vờ nó chạy rồi lỗi khó hiểu, các route `/api/accounts`, `/api/license`, `/api/versions`, `/api/downloads`, `/api/library` trả thẳng `501` khi phát hiện đang chạy trên Vercel, và frontend tự ẩn các phần UI tương ứng, hiện banner giải thích.

Route `POST /api/quick-license` là ngoại lệ: nó gộp đăng nhập + `buyProduct` (lấy license) vào **một request duy nhất**, không cần lưu gì giữa các lần gọi — nên chạy được trên Vercel để bạn xác nhận nhanh account có lấy được license cho một app hay không, mà không cần tự host.

### Deploy lên Vercel

1. Fork/import repo này vào Vercel (New Project → chọn repo).
2. Không cần cấu hình gì thêm — `vercel.json` đã trỏ mọi request `/api/*` vào serverless function tại `api/index.ts`, phần frontend tĩnh trong `public/` được Vercel serve trực tiếp.
3. (Tuỳ chọn) đặt `ACCESS_PASSWORD` trong Project Settings → Environment Variables nếu không muốn ai vào cũng dùng được.
4. Deploy xong, mở domain Vercel cấp — bạn sẽ thấy banner "Chế độ Vercel (giới hạn)", chỉ còn mục Tra cứu + Lấy license.

### Self-host bằng Docker (đầy đủ tính năng)

```bash
git clone https://github.com/pmt1506/OldStore.git
cd OldStore
cp .env.example .env   # chỉnh ACCESS_PASSWORD, PORT... nếu cần
docker compose up -d
```

Mặc định lắng nghe ở `:8080`, dữ liệu (tài khoản đã đăng nhập + thư viện IPA) lưu ở `./data` (mount volume, sống sót qua restart/rebuild container).

Muốn build/chạy tay không qua compose:

```bash
docker build -t oldstore .
docker run -d -p 8080:8080 -v $(pwd)/data:/app/data --env-file .env oldstore
```

### Self-host không dùng Docker

Yêu cầu Node.js >= 20.

```bash
npm install
cp .env.example .env
npm run dev      # phát triển, tự reload
# hoặc production:
npm run build && npm run start:dist
```

Mở `http://localhost:8080`.

## Sử dụng (chế độ đầy đủ)

1. **Đăng nhập Apple ID** ở mục 1 (mật khẩu và mã 2FA chỉ đi thẳng tới Apple, server chỉ lưu lại `passwordToken` + cookie phiên — không lưu mật khẩu).
2. **Dán link App Store** (hoặc bundle ID / trackId) ở mục 2 → bấm Tra cứu để xem bundle ID, phiên bản, `minimumOsVersion`.
3. Bấm **"Xem phiên bản cũ"** nếu muốn chọn một build cũ hơn (phù hợp thiết bị iOS đời thấp) trước khi tải.
4. Bấm **"Lấy license"** (chỉ lấy quyền sở hữu, chưa tải) hoặc **"Lấy license & tải IPA"** (làm cả hai, có progress bar).
5. File hoàn tất sẽ xuất hiện trong mục **3. Thư viện IPA** — tải xuống hoặc xoá tại đây. File vật lý nằm ở `data/ipas/<bundleId>/<version>-<build>.ipa`.

## Sử dụng (chế độ Vercel)

Dán link App Store để tra cứu, sau đó nhập Apple ID/mật khẩu/(mã 2FA nếu có) ngay trong form "Lấy license" — mọi thứ chạy trong 1 request, không có gì được lưu lại. Muốn tải file IPA thật, chuyển sang self-host Docker.

### Giới hạn quan trọng

- **Chỉ hỗ trợ app miễn phí** (`price === 0`). App trả phí bị chặn ở bước lấy license — công cụ này không thực hiện thanh toán thật.
- Apple **không** công bố `minimumOsVersion` cho từng bản build cũ — chỉ có bản mới nhất. Khi tải bản cũ, bạn cần tự thử/biết trước build nào tương thích thiết bị của mình.
- Tài khoản Apple ID phải "sở hữu được" app đó trên store tương ứng — một số app chỉ có ở store của một số quốc gia.

## Cấu trúc

```
src/
  apple/        Giao thức StoreAPI: auth, purchase (license), download, lookup, plist, cookie
  services/      accountStore (tài khoản), library (chỉ mục IPA), sinfInjector (chèn license vào ipa),
                 downloader, downloadJobs (điều phối license -> tải -> chèn license)
  middleware/    accessAuth (mật khẩu truy cập), vercelGuard (chặn route không chạy được trên Vercel)
  routes/        REST API (Express), gồm quickLicense.ts cho luồng 1-request dùng trên Vercel
  app.ts         Xây dựng Express app (dùng chung cho server.ts và api/index.ts)
  server.ts      Điểm khởi động cho self-host/Docker (app.listen)
api/index.ts     Điểm khởi động cho Vercel (serverless, không gọi listen)
public/          Frontend HTML/CSS/JS thuần (không cần build step)
data/            accounts.json, library.json, ipas/ (bị .gitignore, tự sinh khi chạy self-host)
```

## Biến môi trường (`.env`)

| Biến              | Mặc định   | Ý nghĩa                                                             |
| ----------------- | ---------- | -------------------------------------------------------------------- |
| `PORT`             | `8080`     | Cổng lắng nghe (self-host)                                            |
| `DATA_DIR`         | `./data`   | Nơi lưu tài khoản đã đăng nhập + thư viện IPA (self-host)             |
| `ACCESS_PASSWORD`  | *(trống)*  | Nếu đặt, mọi request `/api/*` phải kèm header `X-Access-Password`    |
| `MAX_DOWNLOAD_MB`  | `0`        | Chặn tải nếu file vượt quá dung lượng này (MB). `0` = không giới hạn |

`VERCEL` không cần bạn tự đặt — Vercel tự set khi build/chạy, app dùng nó để chuyển sang chế độ giới hạn.

## Lưu ý an toàn / pháp lý

- Đây là công cụ **cá nhân**. Nếu self-host và expose ra ngoài, **bắt buộc** đặt `ACCESS_PASSWORD` và đặt sau HTTPS reverse proxy, vì server có xử lý mật khẩu Apple ID (dù không lưu lại) và giữ token đăng nhập trong `data/accounts.json`.
- Không có bước nào bẻ khoá DRM/FairPlay — IPA tải về chỉ dùng được với license (SINF) đã chèn, gắn với chính Apple ID bạn đăng nhập, y hệt cách iTunes/Apple Configurator từng hoạt động.
- Việc dùng API riêng tư này để tải lại app đã "mua" (kể cả miễn phí) nằm ngoài luồng App Store chính thức và có thể vi phạm Điều khoản dịch vụ của Apple dù không phạm luật bản quyền theo cách thông thường — dùng cho mục đích cá nhân (backup, cài lên thiết bị cũ của chính bạn) và tự chịu rủi ro.
