# apps/web

Giao diện web một trang (chưa có đăng nhập): biểu đồ nến cổ phiếu Việt Nam và crypto, giá quy đổi sang VND.

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + [lightweight-charts](https://github.com/tradingview/lightweight-charts) v5.

## Chạy local

Cần backend FastAPI đang chạy ở `http://localhost:8000` (xem README gốc). Ở thư mục gốc của repo:

```bash
pnpm install                 # lần đầu
pnpm --filter web dev        # http://localhost:3000
```

Đổi địa chỉ API bằng biến môi trường (copy `.env.example` thành `.env.local`):

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Kiểm tra trước khi commit: `pnpm --filter web lint` và `pnpm --filter web build`.

## Tính năng

- **Sidebar**: 2 tab *Cổ phiếu VN* / *Crypto*; mỗi mã có giá VND đã quy đổi và badge % so với phiên trước (xanh tăng, đỏ giảm, vàng đứng giá).
- **Header**: mã đang chọn, giá hiện tại dạng tiền Việt (`85.900 ₫`, `1.891.538.254 ₫`), ô tỷ giá USDT → VND (mặc định 25.400, áp dụng sau khi ngừng gõ ~0,5 giây), khung nến *Theo Tháng (1M)* / *Theo Ngày (1D)*, khoảng thời gian *3T / 6T / 1N / Tất cả*.
- **Biểu đồ**: nến tăng (close ≥ open) `#22c55e`, nến giảm `#ef4444`; cột khối lượng ở 20% đáy biểu đồ cùng màu với nến; kéo / phóng to bằng chuột, bánh xe hoặc cảm ứng; tooltip theo con trỏ hiện Ngày/Tháng, Mở - Cao - Thấp - Đóng (VND) và Khối lượng.

Ghi chú:

- Việc quy đổi do API làm (`usd_vnd_rate`). Mã niêm yết bằng VND không tải lại khi đổi tỷ giá.
- Các series đã tải được giữ trong bộ nhớ (tối đa 30), nên chuyển qua lại giữa các mã / khung nến không gọi lại API.
- Khi đổi tỷ giá, biểu đồ giữ nguyên vùng đang xem. Khi đổi mã hoặc khung nến, khoảng thời gian đang chọn được áp dụng lại.
- Logo TradingView ở góc biểu đồ là attribution theo giấy phép của lightweight-charts. Giữ nguyên.

## Cấu trúc

```
src/
  app/                    layout (font Inter có subset tiếng Việt), page, theme màu (globals.css), icon
  components/
    market-dashboard.tsx  state, gọi API, cache series, trạng thái tải / lỗi
    instrument-sidebar.tsx
    chart-header.tsx      giá hiện tại, ô tỷ giá, nút khung nến / khoảng thời gian
    price-chart.tsx       lightweight-charts: nến, volume, tooltip, khoảng hiển thị
  lib/
    api.ts                client có kiểu cho /api/instruments và /api/prices/{symbol}
    format.ts             định dạng vi-VN (tiền, %, ngày, khối lượng)
    instrument.ts         tên hiển thị mã, sàn
```
