# Số liệu hiệu suất dùng cho CV

Đo lại ngày 2026-08-21 trên Windows 11, Node 22.18 và PostgreSQL 16 local. Mỗi phép đo warm-up một lần, sau đó chạy 5 vòng trên cùng dataset. Phiên này chỉ đo, không sửa source code.

| Hạng mục | Dataset | Kết quả định lượng |
|---|---:|---:|
| Lọc sân còn trống bằng Prisma relational filtering | 50 cơ sở, 200 sân | Loại bỏ **449/450 lượt truy vấn DB dư thừa (99,8%)** |
| Batch API lấy thông tin kèo giữa hai microservice | 101 kèo | Hợp nhất 101 lượt gọi xuống 1, loại bỏ **100/101 HTTP request nội bộ (99,0%)** |

Các phần trăm trên thể hiện số lượt gọi được loại bỏ, không phải tuyên bố hệ thống nhanh hơn 99%. Phép đo chạy trên local development, không đại diện cho production.

## Bullet CV

- Prisma relational filtering loại bỏ **449/450 lượt truy vấn DB dư thừa (99,8%)** khi lọc 50 cơ sở với 200 sân.
- Batch API hợp nhất 101 lượt gọi xuống còn 1, loại bỏ **100/101 HTTP request giữa các microservice (99,0%)** khi tải danh sách kèo.
