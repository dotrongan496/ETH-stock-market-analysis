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
