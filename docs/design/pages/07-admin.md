---
type: page-design
page: admin
phase: GĐ1
milestone: P25-6
route: /admin
updated: 2026-08-09
---

# Quản trị (Admin console)

## Tham chiếu Playo
Playo **không có** admin console công khai (Partner App riêng). → **Tự thiết kế**
theo design system Playo (nền sáng, card trắng, table sạch, tab/segmented), để
nhìn vẫn "một Playo".

## Đối chiếu scope
Admin là **giao diện tổng hợp** các chức năng Admin nằm trong service nghiệp vụ
(ACC-08, VEN-02, FIN-11, FIN-13, FIN-14) — không phải service riêng. Giữ đúng 4
mảng hiện có trong `AdminPage`: **Duyệt NCC · Rút tiền · Đối soát · Tranh chấp**
(GĐ2 thêm **Kiểm duyệt cộng đồng** — spec `10`).

## Route
`/admin` (đã có, chỉ role `admin`) → re-skin. Tab qua query `?tab=providers|withdrawals|reconciliation|disputes|moderation`.

## Bố cục

1. **Header**: H1 "Quản trị" + (tuỳ chọn) khối KPI nhỏ (số NCC chờ duyệt, số yêu
   cầu rút, số tranh chấp mở) dạng stat tile — chỉ khi API cung cấp; không bịa số.
2. **Tabs ngang** (design-system Tabs, gạch chân xanh): Duyệt NCC · Rút tiền · Đối
   soát · Tranh chấp · (GĐ2) Kiểm duyệt.
3. **Nội dung tab = DataTable** sạch (thay AdminTable): header dính, hàng zebra rất
   nhẹ, hover `green-50`, badge trạng thái theo ngữ nghĩa, cột hành động cuối:
   - **Duyệt NCC** (VEN-02): tên NCC, ngày nộp, trạng thái; hành động **Duyệt**
     (primary) / **Từ chối** (danger, mở modal nhập lý do).
   - **Rút tiền** (FIN-11): `FinanceAdminPanel mode="withdrawals"` re-skin — số tiền,
     NCC, trạng thái; xử lý chuyển khoản tay + đối soát webhook.
   - **Đối soát** (FIN-14): `FinanceAdminPanel mode="reconciliation"` — giao dịch
     chưa khớp, hành động khớp/ghi nhận.
   - **Tranh chấp** (FIN-13): `DisputeAdminPanel` — hàng chờ + audit; giải quyết
     (chấp nhận/bác), ghi lý do.
   - **Kiểm duyệt** (GĐ2, COM-06): hàng chờ report bài viết/bình luận; ẩn/gỡ/bỏ qua.
4. **Modal xác nhận** cho mọi hành động không thể hoàn (từ chối/gỡ/giải quyết): tóm
   tắt + nhập lý do + xác nhận danger.

## Component dùng
Tabs, DataTable (sticky header, badge, row action), Button (primary/danger),
Modal xác nhận + textarea lý do, StatTile (tuỳ chọn), Toast, EmptyState, Skeleton,
Pagination.

## Nối API thật
`getAdminProviders`, `approveProvider`, `rejectProvider(reason)`; `FinanceAdminPanel`
(withdrawals/reconciliation); `DisputeAdminPanel`; (GĐ2) API moderation cộng đồng.
Giữ nguyên guard role `admin` ở `App.tsx`.

## Trạng thái
- Loading: skeleton rows.
- Empty: "Không có mục chờ xử lý" mỗi tab.
- Error: toast + giữ bảng cũ.
- Auth: không phải admin → điều hướng `/` (đã có logic).

## Motion
Chuyển tab fade; row hover đổi nền; modal fade+scale. Giữ tối giản (công cụ tác nghiệp).

## Tiêu chí đạt (AC-UI)
1. Tông sáng/xanh, DataTable sạch thay bảng cũ; tab gạch chân xanh.
2. Đủ 4(+1 GĐ2) mảng; hành động phá huỷ có modal xác nhận + lý do.
3. Nối API admin thật; guard role giữ nguyên.
4. Badge trạng thái đúng ngữ nghĩa; empty/error tiếng Việt; responsive (table cuộn ngang mobile).
