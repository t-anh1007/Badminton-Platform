# COURTIN — CV metrics warehouse

Ngày đo: 2026-08-20–2026-08-21. Đây là kho bằng chứng để chọn **một** metric phù hợp với JD, không phải danh sách bullet đưa đồng thời vào CV.

## Performance / speed

- **Kết quả:** API gateway `/health` đạt p50 **58 ms**, p95 **196 ms** và **635 req/s** trên 3.000 request, concurrency 50, stack local ở dev mode.
- **Câu dẫn CV tham khảo:** “Delivered responsive API-gateway performance, sustaining 635 requests/second at 196 ms p95 latency in a 3,000-request local benchmark.”
- **Câu dẫn theo Action → Metric → Result:** “Benchmarked request routing through the API gateway, sustaining 635 requests/second at 196 ms p95 latency and establishing a measured performance baseline for six backend services.”
- **Câu dẫn có phần trăm:** “Reduced the frontend transfer payload by **69.3%**, from **800.64 KB uncompressed to 245.73 KB gzip**, improving initial asset delivery through production compression.”
- **Cách tính:** `(800.64 - 245.73) / 800.64 × 100 = 69.3%`. Đây là hiệu quả nén truyền tải, không phải kết quả code-splitting hoặc giảm kích thước source bundle.

## Scale / load

- **Kết quả:** WebSocket phục vụ **500 kết nối đồng thời**; RTT warm p50 **1,1 ms**, đo bằng 200 mẫu RTT và một lượt tải 500 Socket.IO client local.
- **Câu dẫn CV tham khảo:** “Built a real-time matchmaking channel that handled 500 concurrent Socket.IO connections with 1.1 ms median warm round-trip latency.”
- **Câu dẫn theo Action → Metric → Result:** “Measured the Socket.IO matchmaking channel under load, supporting 500 concurrent connections at 1.1 ms median warm round-trip latency and confirming responsive real-time message delivery.”

## Code quality / testing

- **Kết quả:** **298 test thực thi đều pass**, chỉ gồm Venue Booking (117), Finance (95), Matchmaking (77) và Object Storage (9); không phải toàn repo hoặc coverage.
- **Câu dẫn CV tham khảo:** “Strengthened service reliability by validating 298 executed tests across booking, finance, matchmaking, and object-storage components.”
- **Câu dẫn theo Action → Metric → Result:** “Executed automated service-level validation across four backend areas, passing 298 tests and providing regression evidence for booking, finance, matchmaking, and object storage.”

## Availability

- **Kết quả:** **600 health probe thành công** qua gateway, gồm 100 vòng × 6 endpoint local; đây là health sampling, không phải uptime/SLA production.
- **Câu dẫn CV tham khảo:** “Verified local service availability through 600 successful health probes across six endpoints routed by the API gateway.”
- **Câu dẫn theo Action → Metric → Result:** “Ran gateway-routed health verification across six service endpoints, completing 600 successful local probes and confirming that each service remained reachable throughout the measurement window.”

## Security / compliance

- **Kết quả:** **15.000 HMAC check** cho payload hợp lệ, giả mạo và bị sửa; gọi trực tiếp `verifySepaySignature` với 5.000 trường hợp mỗi nhóm và không kích hoạt mailer.
- **Câu dẫn CV tham khảo:** “Hardened payment-webhook verification by validating HMAC-SHA256 behavior across 15,000 valid, forged, and tampered payload checks.”
- **Câu dẫn theo Action → Metric → Result:** “Validated HMAC-SHA256 payment-webhook verification across 15,000 legitimate, forged, and tampered payload checks, confirming rejection of modified callback data.”

## Automation / productivity

- **Kết quả:** Audit tự động **157 capability**, phát hiện **4 mapping còn thiếu**; `ui:coverage` quét 126 HTTP, 8 Socket.IO và 23 event capability.
- **Câu dẫn CV tham khảo:** “Automated backend-to-UI capability auditing across 157 HTTP, Socket.IO, and event surfaces, uncovering four missing manifest mappings.”
- **Câu dẫn theo Action → Metric → Result:** “Automated cross-layer capability auditing across 157 HTTP, Socket.IO, and event surfaces, identifying four missing UI mappings and making integration gaps directly traceable.”
- **Câu dẫn có phần trăm:** “Automated cross-layer auditing across **157 capabilities**, identifying **4 missing UI mappings (2.5%)** and making integration gaps directly traceable.”
- **Cách tính:** `4 / 157 × 100 = 2.5%`. Đây là tỷ lệ capability thiếu mapping tại thời điểm audit, không phải phần trăm hiệu suất được cải thiện.

## Số liệu bổ sung — chỉ dùng khi JD yêu cầu

- Frontend production bundle: **245,7 KB gzip**; build local **1,57 giây**.
- Bộ mã hiện khai báo **486 test case trong 108 file**, cộng **11 E2E case**. Đây là inventory tĩnh, không chứng minh test pass hoặc coverage.
- Prisma relational filtering giảm số DB call từ **450 xuống 1** trên bộ dữ liệu 50 venue/200 court. Đây là call count, không phải latency improvement.
- Batch match-context giảm internal HTTP call từ **101 xuống 1** cho 101 match. Đây là call count, không phải throughput hoặc latency improvement.
- Một lệnh root khởi chạy **6 Node service**, thay cho sáu lần gọi riêng lẻ.

Các kết quả có tỷ lệ lớn hơn 70% không được chuyển thành claim phần trăm trong CV. Khi cần sử dụng, chỉ ghi số trực tiếp, mẫu đo và phạm vi như trên; không thay đổi mẫu đo để ép tỷ lệ xuống thấp hơn.

## Giới hạn bằng chứng

- Không có dữ liệu production uptime, MTTR, SLO hoặc SLA.
- Không có repo-wide pass rate: web và community còn case lỗi; account test đã dừng để tránh kích hoạt mailer. Không được viết “toàn bộ test đều pass”.
- Không quy đổi số request/query bị loại bỏ thành phần trăm giảm latency.
- Không quy đổi automation thành số giờ tiết kiệm vì chưa đo thời gian thủ công.
- Không chạy thêm luồng login, register, reset-password hoặc email khi đo.
