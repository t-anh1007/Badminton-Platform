# Chatbot người chơi mở rộng (21/11/2026)

Spec rút gọn theo yêu cầu PO (gấp). Quyết định: xem memory `player-chatbot-scope-decisions`.

## Phạm vi
Một endpoint `POST community /assistant/chat { question, location? }` (chỉ người chơi). AI phân loại ý định → lấy dữ liệu thật bằng token của chính người hỏi → AI diễn đạt câu trả lời từ dữ liệu + bộ kiến thức nghiệp vụ.

| Ý định | Nguồn dữ liệu | Nút dẫn |
|---|---|---|
| `match` gợi ý kèo | matchmaking `POST /matches/suggestions/ai/chat` (kèm vị trí, tiêu chí) | thẻ kèo |
| `my_bookings` | venue `GET /players/me/bookings` | `/profile?tab=bookings` |
| `my_matches` | matchmaking `GET /matches/me/history` | `/matches` |
| `wallet` | finance `GET /wallets/me` | `/wallet` |
| `rating` | matchmaking `GET /passports/me` | `/profile` |
| `find_courts` | venue `GET /search` (vị trí, ngày, khung giờ) | `/venues/:id` |
| `policy` / `how_to` | `playerKnowledge` (rút từ `tom-tat-luong-nghiep-vu.md`, chỉ phần người chơi) | — |
| `out_of_scope` | từ chối | — |

## Gợi ý kèo
- Chỉ giữ kèo mà mọi thành viên đã biết trình độ (chủ kèo + người đã vào) chênh ≤ 2 bậc so với người hỏi (thang 5 bậc, bậc tính từ rating Passport).
- Khoảng cách Haversine từ vị trí người hỏi tới tọa độ cơ sở; xếp hạng = điểm F-02 − khoảng cách (km, trần 30). Tối đa 5 kèo.
- Thẻ kèo: sân/cơ sở/địa chỉ, khoảng cách, giờ, phí/suất, suất trống, khoảng trình độ, **bậc thành viên ẩn danh** ("2 TB, 1 TB+"), lý do.

## An toàn
- Không đưa source code vào ngữ cảnh. Câu hỏi về code/hệ thống nội bộ, dữ liệu người khác (kể cả hỏi thẳng trình độ người khác) → từ chối, không gọi AI.
- Bot không tự đặt/thanh toán/hủy/tham gia — chỉ đưa nút.

## Chuỗi AI riêng
`AI_ASSISTANT_CHAIN` = Gemini(KEY_1) → Gemini(KEY_2) → Groq(KEY_1) → Groq(KEY_2) → OpenRouter(KEY_1) → OpenRouter(KEY_2) → câu trả lời mẫu. `parseChain` nhận hậu tố `@TEN_BIEN` để chọn biến key cho từng mắt xích; circuit breaker tách theo key. Không đụng `GEMINI_API_KEY`/`GROQ_API_KEY`/`OPENROUTER_API_KEY` (OCR, phán quyết).

## Env cần khai trên Railway
`community-service`: `AI_ASSISTANT_CHAIN`, 6 biến `ASSISTANT_*`, `MATCHMAKING_SERVICE_URL`, `FINANCE_SERVICE_URL`, `VENUE_BOOKING_SERVICE_URL`.
`matchmaking-service`: `AI_ASSISTANT_CHAIN`, 6 biến `ASSISTANT_*`.

## Kiểm chứng
Đã gọi thử 6 key (HTTP 200). PO tự test bằng câu hỏi thật.
