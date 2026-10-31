# ADR 0002: Hỗ trợ Supabase PostgreSQL và Fallback TimescaleDB

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-28

## Bối cảnh
Môi trường phát triển cục bộ có thể chưa cài sẵn Docker Desktop. Người dùng muốn sử dụng dịch vụ đám mây miễn phí (Supabase PostgreSQL) để phát triển và kiểm thử mà không cần vận hành Docker container.

## Rủi ro kỹ thuật
Supabase PostgreSQL không cài đặt extension độc quyền `timescaledb`. Lệnh migration gốc `CREATE EXTENSION timescaledb` và `create_hypertable` sẽ gây lỗi trên Supabase.

## Quyết định
1. Thêm hỗ trợ connection string của Supabase (`postgresql+psycopg://...`) có tham số `sslmode=require`.
2. Sửa migration Alembic `0001_initial_schema.py` để kiểm tra sự tồn tại của extension `timescaledb` thông qua `pg_available_extensions`:
   - Nếu có (môi trường Docker / Timescale Cloud): tự động bật `timescaledb` và tạo hypertable trên `daily_prices(trade_date)`.
   - Nếu không có (môi trường Supabase / Neon): tạo bảng PostgreSQL tiêu chuẩn mà không làm hỏng tiến trình migration.

## Hệ quả
- (+) Chạy được ngay trên Supabase mà không cần cài Docker.
- (+) Giữ nguyên tính tương thích 100% với Docker TimescaleDB khi triển khai sau này.

