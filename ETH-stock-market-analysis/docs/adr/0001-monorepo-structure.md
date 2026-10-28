# ADR 0001: Cấu trúc monorepo

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-28

## Bối cảnh
Dự án gồm web, mobile, API, ML và pipeline dữ liệu, dùng chung schema dữ liệu và contract API.

## Quyết định
Dùng một monorepo với các thư mục cấp cao: `apps/`, `services/`, `pipelines/`, `infra/`, `docs/`, `.github/workflows/`.
Mỗi thành phần tự quản lý dependency của mình (Python: `pyproject.toml` riêng; JS: `package.json` riêng).

## Hệ quả
- (+) Thay đổi xuyên tầng (schema → API → UI) nằm trong một PR.
- (+) CI có thể lọc theo đường dẫn để chỉ chạy phần bị ảnh hưởng.
- (−) CI và quy ước thư mục cần được giữ kỷ luật; `tests/test_repo_structure.py` kiểm tra khung cơ bản.

