# ETH-stock-market-analysis

Nền tảng web + mobile phân tích và dự báo cổ phiếu Việt Nam (HOSE, HNX, UPCoM) và Crypto.

> ⚠️ Nội dung phân tích/dự báo chỉ mang tính tham khảo, **không phải khuyến nghị đầu tư**.

## Cấu trúc monorepo

```
apps/
  web/                # Next.js + TypeScript + Tailwind + shadcn/ui
  mobile/             # React Native (Expo)
services/
  api/                # FastAPI + SQLAlchemy 2 + Alembic
  ml/                 # features, train, backtest, serve (LightGBM/PyTorch + MLflow)
pipelines/
  dags/               # Apache Airflow DAGs
  providers/          # Adapter nguồn dữ liệu: Binance, VNStock (TCBS/SSI/DNSE)
infra/
  docker-compose.yml  # PostgreSQL 16 + TimescaleDB, Redis
  nginx/              # Reverse proxy config
  grafana/            # Dashboards, provisioning
docs/
  adr/                # Architecture Decision Records
  api/                # Tài liệu API
.github/workflows/    # CI (GitHub Actions)
tests/                # Test cấp repo và test providers
```

## Bắt đầu nhanh

```bash
# 1. Chạy toàn bộ test
uv run pytest

# 2. Kiểm tra kết nối Database
uv run python scripts/test_db_connection.py

# 3. Đồng bộ dữ liệu thị trường
uv run python -m pipelines.providers.sync --days 30

# 4. Khởi chạy FastAPI Server (http://localhost:8000, tài liệu API: /docs)
uv run --package eth-api uvicorn eth_api.main:create_app --factory --reload --port 8000

# 5. Khởi chạy giao diện web (terminal khác, cần Node 20+ và pnpm)
pnpm install
pnpm --filter web dev        # http://localhost:3000
```

### API đọc dữ liệu

| Endpoint | Mô tả |
|---|---|
| `GET /api/instruments?usd_vnd_rate=25400` | Toàn bộ mã kèm giá đóng cửa mới nhất quy đổi VND và % thay đổi so với phiên trước |
| `GET /api/prices/{symbol}?interval=1d\|1m&usd_vnd_rate=25400` | Nến OHLCV bằng VND. `1d`: nến ngày, `1m`: gộp theo tháng. Giá USDT nhân với `usd_vnd_rate`, giá VND giữ nguyên, khối lượng không quy đổi |

### Tự động cập nhật giá

Workflow [`.github/workflows/sync-prices.yml`](.github/workflows/sync-prices.yml) chạy lệnh đồng bộ trên GitHub Actions (7 ngày gần nhất, upsert):

| Giờ Việt Nam | Mục đích |
|---|---|
| 07:20 hằng ngày | Chốt nến crypto của ngày hôm trước (Binance đóng nến lúc 00:00 UTC) |
| 15:50 thứ 2 – 6 | Giá đóng cửa cổ phiếu VN (phiên kết thúc 15:00) |

- Cần secret `DATABASE_URL` trong *Settings → Secrets and variables → Actions*, cùng giá trị như trên Render.
- Chạy tay: tab *Actions → Cập nhật giá hằng ngày → Run workflow*, hoặc `gh workflow run sync-prices.yml`. Có thể đổi số ngày, hoặc chọn *dry run* để chỉ tải thử.
- Lần chạy lỗi sẽ có email báo từ GitHub.
- Với repo public, GitHub sẽ tắt lịch chạy nếu repo không có commit nào trong 60 ngày. Khi đó bật lại ở tab *Actions*.

### Đăng nhập (Supabase Auth)

| | Xem được |
|---|---|
| Chưa đăng nhập | Giá cổ phiếu và crypto (chế độ *Giá trị*, so sánh mã) |
| Đã đăng nhập | Thêm chế độ *Cổ phiếu VN → Thị trường* (trần / sàn / tham chiếu) |

Có đăng ký bằng email + mật khẩu (xác thực qua email), đăng nhập bằng Google và đăng xuất. Phiên đăng nhập được lưu trong trình duyệt và tự gia hạn, nên vẫn còn đăng nhập cho đến khi người dùng bấm *Đăng xuất*. Code nằm ở `apps/web/src/lib/auth.ts`, `components/auth-dialog.tsx`, `components/account-menu.tsx` và `app/auth/callback/`.

Cấu hình một lần:

1. **Biến môi trường của web.** Trên Vercel: *Settings → Environment Variables*, sau đó Redeploy. Chạy ở máy: thêm vào `apps/web/.env.local`.
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: lấy ở Supabase → *Project Settings → API Keys → Publishable key* (`sb_publishable_…`), hoặc dùng *anon key* cũ.

   Hai giá trị này là khóa công khai nên được phép đưa vào trình duyệt. **Không** dùng *secret key* hay *service_role*.
2. **Supabase → Authentication → URL Configuration.**
   - *Site URL*: `https://<tên-miền-web>`
   - *Redirect URLs*: `https://<tên-miền-web>/auth/callback` và `http://localhost:3000/auth/callback`
3. **Email.** Ở *Authentication → Sign In / Providers → Email*: bật *Confirm email* và đặt độ dài mật khẩu tối thiểu là 8 cho khớp với form.
4. **SMTP.** Ở *Authentication → Emails → SMTP Settings*, cấu hình máy chủ gửi mail riêng (Resend, Brevo, Gmail App Password…). Dịch vụ email mặc định của Supabase chỉ gửi tới thành viên trong team của project và mỗi giờ chỉ gửi được vài email.
5. **Mẫu email (khuyên dùng).** Ở *Authentication → Emails → Confirm signup*, đổi đường link trong thư thành:
   `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`
   Như vậy người dùng mở thư trên điện thoại hay trình duyệt khác vẫn đăng nhập được. Nếu giữ link mặc định thì email vẫn được xác thực, nhưng người dùng phải đăng nhập lại khi mở thư ở trình duyệt khác với lúc đăng ký.
6. **Google.** Trong Google Cloud Console → *APIs & Services*:
   - Tạo *OAuth consent screen*.
   - Vào *Credentials → Create OAuth client ID → Web application*.
   - *Authorized JavaScript origins*: `https://<tên-miền-web>`
   - *Authorized redirect URIs*: `https://<project-ref>.supabase.co/auth/v1/callback`

   Sau đó copy *Client ID* và *Client secret* vào Supabase → *Authentication → Sign In / Providers → Google*, rồi bật Google lên.

## Deploy lên tên miền riêng

```
yourdomain.com, www.yourdomain.com  →  Vercel  (apps/web)
api.yourdomain.com                  →  Render  (services/api, cấu hình trong render.yaml)
                                         └→ Supabase Postgres
```

1. **API (Render)**: Dashboard → *New → Blueprint* → chọn repo. Điền `DATABASE_URL` (Supabase Session pooler) và `CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com`. Kiểm tra `https://<service>.onrender.com/health/ready`, rồi *Settings → Custom Domains* thêm `api.yourdomain.com`.
2. **Web (Vercel)**: *Add New → Project* → chọn repo, **Root Directory** = `apps/web`, biến môi trường `NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com` (giá trị được gắn lúc build: đổi biến thì phải Redeploy). *Settings → Domains* thêm `yourdomain.com` và `www.yourdomain.com`.
3. **DNS** (tại nhà đăng ký tên miền), chép đúng giá trị Vercel/Render hiển thị:

   | Type | Name | Value |
   |---|---|---|
   | A | `@` | IP do Vercel cung cấp (thường `76.76.21.21`) |
   | CNAME | `www` | `cname.vercel-dns.com` |
   | CNAME | `api` | `<service>.onrender.com` |

   Dùng Cloudflare DNS thì để bản ghi `api` ở chế độ *DNS only*. HTTPS được cấp tự động sau khi DNS cập nhật.

Lỗi CORS trên trình duyệt: kiểm tra `CORS_ORIGINS` có đúng `https://...`, không có `/` ở cuối. Gói free của Render ngủ sau 15 phút không có truy cập (lần gọi đầu chậm ~30–50 giây).
