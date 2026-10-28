# services/ml

| Thư mục     | Vai trò                                                         |
|-------------|-----------------------------------------------------------------|
| `features/` | Tính feature chỉ từ dữ liệu ≤ thời điểm t (chống leakage)       |
| `train/`    | Huấn luyện + log MLflow                                         |
| `backtest/` | Walk-forward validation, so sánh với baseline (naive, MA)       |
| `serve/`    | Phục vụ dự báo cho API                                          |

