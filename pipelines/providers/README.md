# pipelines/providers

Adapter nguồn dữ liệu, cùng một interface chung (sẽ định nghĩa ở nhiệm vụ riêng):

| Provider  | Ghi chú                                                                  |
|-----------|--------------------------------------------------------------------------|
| `vnstock` | Thư viện cộng đồng, gọi API không chính thức — kiểm tra điều khoản/giấy phép trước khi dùng thương mại |
| `ssi`     | SSI FastConnect Data — cần tài khoản + `SSI_CONSUMER_ID/SECRET`          |
| `dnse`    | DNSE API — cần tài khoản + `DNSE_USERNAME/PASSWORD`                      |

Credential chỉ đọc từ biến môi trường, không hard-code.

