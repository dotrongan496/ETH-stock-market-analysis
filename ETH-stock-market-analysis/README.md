# ETH-stock-market-analysis

Nền tảng web + mobile phân tích và dự báo cổ phiếu Việt Nam (HOSE, HNX, UPCoM).

> ⚠️ Nội dung phân tích/dự báo chỉ mang tính tham khảo, **không phải khuyến nghị đầu tư**.

apps/
web/ # Next.js + TypeScript + Tailwind + shadcn/ui
mobile/ # React Native (Expo)
services/
api/ # FastAPI + SQLAlchemy 2 + Alembic
ml/ # features, train, backtest, serve (LightGBM/PyTorch + MLflow)
pipelines/
dags/ # Apache Airflow DAGs
providers/ # Adapter nguồn dữ liệu: vnstock, ssi, dnse
infra/
docker-compose.yml # PostgreSQL 16 + TimescaleDB, Redis
nginx/ # Reverse proxy config
grafana/ # Dashboards, provisioning
docs/
adr/ # Architecture Decision Records
api/ # Tài liệu API
.github/workflows/ # CI (GitHub Actions)
tests/ # Test cấp repo (cấu trúc, cấu hình)
