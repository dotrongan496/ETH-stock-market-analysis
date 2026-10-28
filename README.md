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

# 4. Khởi chạy FastAPI Server
uv run --package eth-api uvicorn eth_api.main:create_app --factory --reload --port 8000
```
