"""Helper script to test database connectivity with clear, actionable error messages.

Usage:
  uv run python scripts/test_db_connection.py
"""

from __future__ import annotations

import sys
from sqlalchemy import create_engine, text
from eth_api.config import get_settings


def test_connection() -> int:
    try:
        settings = get_settings()
    except Exception as exc:
        print(f"[ERROR] Không đọc được cấu hình từ file .env: {exc}")
        return 1

    db_url = settings.database_url
    print(f"[*] Đang thử kết nối tới: {db_url.split('@')[-1] if '@' in db_url else db_url}")

    if "localhost:5432" in db_url or "change-me" in db_url:
        print("\n[!] CẢNH BÁO: Bạn vẫn đang để URL mặc định (localhost / change-me).")
        print("    Vì máy bạn chưa có Docker, hãy dán URL lấy từ Supabase vào file .env!")
        return 1

    try:
        engine = create_engine(db_url, pool_pre_ping=True)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version();")).scalar()
            print("\n[SUCCESS] KET NOI THANH CONG!")
            print(f"          Database: {result}")
            return 0
    except Exception as exc:
        err_msg = str(exc)
        print("\n[FAILED] KHONG THE KET NOI TOI DATABASE:")
        print(f"         Chi tiết lỗi: {err_msg}")
        if "password authentication failed" in err_msg.lower():
            print("\n-> GỢI Ý: Sai mật khẩu (password) trong file .env. Hãy kiểm tra lại mật khẩu bạn đã đặt.")
        elif "could not translate host name" in err_msg.lower() or "name or service not known" in err_msg.lower():
            print("\n-> GỢI Ý: Sai tên miền host Supabase. Hãy kiểm tra lại phần sau ký tự '@' trong file .env.")
        elif "ssl" in err_msg.lower():
            print("\n-> GỢI Ý: Thiếu '?sslmode=require' ở cuối URL. Hãy thêm đuôi này vào chuỗi kết nối.")
        return 1


if __name__ == "__main__":
    sys.exit(test_connection())

