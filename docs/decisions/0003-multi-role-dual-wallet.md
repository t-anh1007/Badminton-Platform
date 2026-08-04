# 0003 Đa vai trò trên một tài khoản, ví cá nhân tách khỏi ví kinh doanh

Date: 2026-08-05

## Status

Accepted

## Context

`SCOPE_BASELINE.md` mô tả `VEN-01 Đăng ký nhà cung cấp sân` với actor chính là **Người chơi**,
tức một người chơi xin lên làm chủ sân. Nhưng `data-model.md` định nghĩa
`USER.role` là `enum "player|provider|admin"` — một giá trị duy nhất. Hai mô tả này không
tương thích: nếu duyệt hồ sơ nhà cung cấp làm `role` lật từ `player` sang `provider`, chủ sân
mất quyền đặt sân, tìm kèo và tham gia cộng đồng trên chính tài khoản của mình.

Vấn đề nghiêm trọng hơn nằm ở tiền. `WALLET.userId` có ràng buộc `UK`, mỗi người đúng một ví.
Một người chơi nạp tiền rồi trở thành chủ sân sẽ có một ví chứa lẫn tiền nạp và doanh thu
bán hàng. `FIN-10 Yêu cầu rút số dư khả dụng` là quyền của chủ sân, nên họ rút được cả khoản
đã nạp — biến tiền nạp thành tiền mặt. Ràng buộc bất biến #6 chỉ cấm chuyển ngang hàng giữa
người dùng nên không chặn được tình huống này.

## Decision

**Vai trò là tập hợp.** `USER.role` chuyển từ enum đơn giá trị sang tập vai trò. Mọi tài khoản
giữ vai `player` vĩnh viễn. Vai `provider` được **cộng thêm** khi VEN-02 duyệt, không thay thế
vai cũ. Vai `admin` được seed sẵn khi triển khai.

**Ví tách đôi.** `WALLET` bỏ ràng buộc `UK` trên `userId` và thêm trường
`walletType "personal|business"`. Mỗi tài khoản có một ví `personal`, tạo khi xác minh email
thành công. Ví `business` chỉ được tạo khi VEN-02 duyệt hồ sơ nhà cung cấp.

Ranh giới dòng tiền:

| Ví | Nhận | Chi |
|---|---|---|
| `personal` | `topup`, `refund` | `payment` |
| `business` | `commission`, `release` | `payout` |

**Không chuyển tiền giữa hai ví của cùng một người ở GĐ1.** Chủ sân muốn dùng doanh thu để
đặt sân thì rút về ngân hàng rồi nạp lại như người dùng thường.

## Alternatives Considered

1. **Một vai trò duy nhất.** Giữ nguyên `data-model.md`, duyệt VEN-02 thì lật `player` sang
   `provider`. Phân quyền sạch nhất và không có vấn đề lẫn tiền, nhưng chủ sân không đặt sân
   hay đăng bài được trên cùng tài khoản, và số tiền đã nạp trước đó mắc kẹt.

2. **Đa vai trò, một ví.** Giữ `WALLET.userId UK`, suy ra số tiền rút được từ `LEDGER_ENTRY`
   theo `type`. Ít thay đổi lược đồ nhất. Bị loại vì chủ sân cũng là người chơi nên có thể
   tiêu doanh thu để đặt sân; khi đó số rút được tính theo ledger vẫn cao trong khi ví thực đã
   vơi, buộc phải chồng thêm luật `min(số dư thật, doanh thu ròng)` và quy tắc trừ theo nguồn.
   Đó là logic dẫn xuất đặt ngay trên đường đi của tiền — loại lỗi đắt nhất và khó chứng minh
   đúng nhất trong hệ thống.

## Consequences

Positive:

- Mọi câu hỏi về tiền trở thành tra một trường, không còn phép tính nào phải chứng minh là đúng.
- `FIN-03` trừ ví cá nhân, `FIN-10` rút từ ví kinh doanh. Không có trường hợp biên nào giữa hai.
- Chủ sân dùng nền tảng như người chơi bình thường, đúng thực tế của môn cầu lông.
- Khi bảo vệ đồ án, "tiền cá nhân và tiền kinh doanh nằm ở hai sổ tách biệt" giải thích được
  trong một câu.
- `LEDGER_ENTRY` giữ nguyên, không phải sửa.

Tradeoffs:

- `data-model.md` phải sửa hai chỗ: `USER.role` và `WALLET`.
- `FIN-01` phải hiển thị hai số dư cho người có vai `provider`.
- Kiểm tra quyền ở gateway và các service phải xét tập vai trò thay vì so sánh một giá trị.
- Người dùng thuần chơi vẫn chỉ có một ví, nên chi phí thực tế gần bằng không cho đa số tài khoản.

## Follow-Up

- Cập nhật `data-model.md`: `USER.role` sang tập vai trò; `WALLET` bỏ `UK`, thêm `walletType`.
- Cập nhật `system-architecture.md` §4.2 và §4.4 cho khớp.
- Khi spec `finance-disputes`, xác định rõ `FIN-01` hiển thị hai số dư ra sao và `FIN-09`
  ghi doanh thu vào ví `business` tại thời điểm nào.
