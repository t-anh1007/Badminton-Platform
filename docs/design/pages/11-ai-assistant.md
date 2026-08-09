---
type: page-design
page: ai-assistant
phase: GĐ2
milestone: P25-5
route: /assistant
updated: 2026-08-09
---

# Trợ lý AI (AI Assistant)

## Tham chiếu Playo
Playo **không** có trợ lý AI. → **Tự thiết kế** theo design system Playo (card
trắng, chip nguồn, tông sáng/xanh) cho đúng nghiệp vụ dự án.

## Đối chiếu scope
- Dự án: **AI-01** gợi ý kèo phù hợp **có giải thích** (nâng bởi F-02 độ hợp);
  **AI-02** chatbot **RAG có nguồn** trên **chính sách công khai + dữ liệu CỦA
  CHÍNH user** (D-P2-5, không rò chéo user). Provider = **Gemini** (D-P2-6).
- **Bất biến #8:** AI **chỉ hỗ trợ + giải thích**, **không tự hành động** (không tự
  tạo JOIN, hủy booking, hoàn tiền, moderation). Mọi "hành động" chỉ là **CTA dẫn
  tới luồng nghiệp vụ chuẩn**.

## Route
`/assistant` (đăng nhập). Có thể mở dạng trang hoặc panel; đề xuất **trang 2 tab**.

## Bố cục

1. **Header**: H1 "Trợ lý AI" + **segmented 2 tab**: **Gợi ý kèo** | **Chat hỗ trợ**.
2. **Tab Gợi ý kèo** (AI-01/F-02):
   - Danh sách **thẻ gợi ý kèo**: MatchCard rút gọn + **điểm độ hợp** (Geist Mono)
     + **giải thích** ngắn ("Hợp vì trình độ gần bạn, cùng khu vực, còn chỗ").
   - Mỗi thẻ có CTA **Xem kèo** → `/matches/:id` (AI **không** tự join; đi qua MMP-04).
   - **Fallback (AC-AI-01-3):** khi Gemini lỗi/hết quota, tab này **vẫn hiện danh
     sách** xếp theo điểm F-02 (deterministic) với nhãn **"giải thích rút gọn"** —
     KHÔNG màn trắng, KHÔNG chỉ báo lỗi.
   - **Điều kiện (AC-AI-01):** cần đã khai báo trình độ (Passport). Chưa có → EmptyState
     dẫn tới khai báo trình độ (spec `09`).
3. **Tab Chat hỗ trợ** (AI-02 RAG):
   - Khung chat full-height trong content area: bong bóng user/assistant; câu trả
     lời của AI có **source chips** (nguồn: điều khoản / booking của bạn / kèo của
     bạn) cuộn ngang; input dưới cùng + gợi ý câu hỏi.
   - Khi câu hỏi ngụ ý hành động (vd "hủy giúp tôi booking X") → AI trả **hướng dẫn
     + CTA** mở luồng chuẩn, **không** tự thực hiện.
   - Fallback rõ khi Gemini bận/hết quota ("Trợ lý tạm bận, thử lại sau").

## Component dùng
Segmented control, SuggestionCard (MatchCard + score + giải thích), ChatWindow
(MessageBubble, SourceChips, Composer, TypingIndicator), Button (CTA dẫn luồng),
Toast, EmptyState, Skeleton.

## Nối API thật
AI-01 (gợi ý kèo có giải thích), AI-02 (chat RAG qua `packages/ai`/Gemini). Nguồn
RAG **chỉ** chính sách công khai + dữ liệu của chính user. Không endpoint hành động
từ AI. Field/nguồn thiếu → dừng hỏi PO.

## Trạng thái
- Loading: skeleton gợi ý; typing indicator chat.
- Empty: không có gợi ý → EmptyState + gợi ý khai báo trình độ / mở rộng khu vực.
- Error/Fallback: Gemini bận/hết quota → **Gợi ý kèo** rơi về danh sách F-02 +
  "giải thích rút gọn"; **Chat** báo "Trợ lý tạm bận, thử lại sau" và giữ hội thoại.
  Không chặn nghiệp vụ chính.
- Auth: bắt buộc đăng nhập (RAG dùng dữ liệu của chính user).

## Motion
Tin nhắn/typing fade-in; source chips cuộn ngang; segmented đổi tab fade. Không
auto-scroll cưỡng bức trừ khi user ở đáy hội thoại.

## Tiêu chí đạt (AC-UI)
1. 2 tab (Gợi ý kèo / Chat) segmented, tông sáng/xanh.
2. Gợi ý kèo **có điểm + giải thích**; CTA chỉ **dẫn** tới luồng, AI không tự hành động (#8).
3. Chat có **source chips** (chính sách công khai + dữ liệu của chính user), không rò chéo user.
4. Fallback: Gợi ý kèo vẫn hiện danh sách F-02 khi Gemini lỗi; Chat báo tạm bận; empty/error tiếng Việt.
5. Nối AI API thật; responsive (tab dạng segmented, chat full-height, chips cuộn ngang mobile).
