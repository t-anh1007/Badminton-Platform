# Muse — 20 ảnh bảng lật, chia theo 6 trận (bộ stress test tổng hợp)

> Ảnh AI tạo. Báo cáo ở MỤC RIÊNG, không gộp vào thống kê chính.

## Quy ước

- Bảng 4 lá, trái → phải: `[A điểm ván] [A số ván thắng] [B số ván thắng] [B điểm ván]`. Nhãn: `A điểm | A ván | B ván | B điểm`.
- **Mỗi ảnh = khoảnh khắc ngay sau khi một ván kết thúc**: lá lớn giữ tỉ số ván vừa xong, lá nhỏ ĐÃ cộng ván vừa xong.
- Mọi ván hợp luật: tới 21, chênh 2, chạm 30 dừng (30-29 / 30-28 đều hợp lệ).
- Trận BO5 không phải chuẩn BWF nhưng có ở giải phong trào; vẫn dùng ván 21 điểm.
- Ảnh cùng một trận: **cùng sân, cùng bảng, cùng người chơi** (giữ nguyên mô tả cảnh); chỉ đổi góc chụp/điều kiện ảnh và tỉ số.
- Độ khó (1 rõ · 2 nghiêng/xa · 3 chói/tối/nhòe · 4 bị che · 5 khó nhất) rải đều: mỗi mức 4 ảnh.

## Lỗi chữ số thường gặp → ràng buộc

| Lỗi | Câu ràng buộc |
|---|---|
| Số thừa (giờ, số áo, quảng cáo) | "No other numbers or text anywhere in the image." |
| Glyph méo | "Clean, legible sans-serif digits." |
| Sai số lá / đảo thứ tự | "Exactly four flip cards, left to right: …" |
| Số 2 chữ số tách 2 lá | "Two-digit numbers stay on a single card." |

`[NEG]` = `No other numbers, letters, logos or watermarks anywhere in the image; clean legible sans-serif digits; two-digit numbers stay on one card; exactly four cards. Candid smartphone photo, not a product shot, not an illustration.` (thay chữ [NEG] bằng câu này khi dán).

---

## Trận 1 — BO3, A thắng 2-1 (đủ 3 ván)
Cảnh chung: sân trong nhà phong trào, sàn thảm xanh, bảng lật trắng số đen trên bàn nhựa trọng tài, hai người chơi đơn nam áo xanh (A) và áo đỏ (B).

**muse01** — T1 ván 1, độ khó 1 (rõ, chính diện). Nhãn `21 | 1 | 0 | 17`
```
Candid smartphone photo in an indoor community badminton hall in Vietnam, green court mat, fluorescent lights. Close straight-on view of a white flip scoreboard with black digits on a plastic umpire table. Exactly four flip cards, left to right: large "21", small "1", small "0", large "17". Sharp focus. In the blurred background a player in a blue shirt and a player in a red shirt shake hands at the net after the game. Digits must read exactly 21, 1, 0, 17. [NEG]
```
**muse02** — T1 ván 2, độ khó 2 (nghiêng ~35° trái). Nhãn `19 | 1 | 1 | 21`
```
Candid smartphone photo in the same indoor Vietnamese badminton hall, green court mat. The white flip scoreboard on the plastic umpire table is shot from about 35 degrees to the left. Exactly four flip cards, left to right: large "19", small "1", small "1", large "21". Far cards appear smaller but readable. Blue-shirt and red-shirt players towel off by the bench. Digits must read exactly 19, 1, 1, 21. [NEG]
```
**muse03** — T1 ván 3, độ khó 3 (chói đèn trần). Nhãn `21 | 2 | 1 | 15`
```
Candid smartphone photo in the same indoor Vietnamese badminton hall. Frontal view of the glossy white flip scoreboard; a bright LED glare streak crosses the cards and washes out parts of the digits. Exactly four flip cards, left to right: large "21", small "2", small "1", large "15". Blue-shirt player raising his arms in the background. Digits must read exactly 21, 2, 1, 15. [NEG]
```

## Trận 2 — BO3, B thắng 2-0 (chỉ 2 ván)
Cảnh chung: sân ngoài trời khu dân cư, nền bê tông sơn, cây phía sau, bảng lật nhựa xanh số trắng đặt trên ghế đẩu, hai người chơi nữ.

**muse04** — T2 ván 1, độ khó 1. Nhãn `12 | 0 | 1 | 21`
```
Candid smartphone photo at an outdoor neighborhood badminton court in Vietnam, daytime, painted concrete, trees behind. Close frontal view of a blue plastic flip scoreboard with white digits on a stool. Exactly four flip cards, left to right: large "12", small "0", small "1", large "21". Crisp focus. Two women players walking back to the baseline in the background. Digits must read exactly 12, 0, 1, 21. [NEG]
```
**muse05** — T2 ván 2, độ khó 4 (chai nước che nửa dưới lá nhỏ bên phải). Nhãn `20 | 0 | 2 | 22`
```
Candid smartphone photo at the same outdoor Vietnamese badminton court. Blue flip scoreboard on the stool, a plain plastic water bottle without label stands in front of it covering the lower half of the small right-middle card. Exactly four flip cards, left to right: large "20", small "0", small "2", large "22". Two women players hugging at the net. Digits must read exactly 20, 0, 2, 22. [NEG]
```

## Trận 3 — BO5, A thắng 3-2 (đủ 5 ván)
Cảnh chung: nhà thi đấu cấp phường sàn gỗ, bảng lật đỏ-trắng số đen trên bàn ghi điểm có trọng tài ngồi, trận đôi nam.

**muse06** — T3 ván 1, độ khó 1. Nhãn `21 | 1 | 0 | 18`
```
Candid smartphone photo in a Vietnamese ward sports hall with wooden-look floor. Straight-on close shot of a red-and-white flip scoreboard with black digits on the scorer's desk. Exactly four flip cards, left to right: large "21", small "1", small "0", large "18". Perfect focus. Men's doubles teams changing ends in the background. Digits must read exactly 21, 1, 0, 18. [NEG]
```
**muse07** — T3 ván 2, độ khó 2 (chụp xa từ khán đài, bảng ~10% khung). Nhãn `16 | 1 | 1 | 21`
```
Candid smartphone photo from the spectator seats of the same Vietnamese ward sports hall, wooden floor. Wide shot of the whole court with men's doubles players, the red-and-white flip scoreboard on the scorer's desk occupies about 10% of the frame. Exactly four flip cards, left to right: large "16", small "1", small "1", large "21". Digits small but legible. Digits must read exactly 16, 1, 1, 21. [NEG]
```
**muse08** — T3 ván 3, độ khó 3 (rung tay, nhòe). Nhãn `23 | 2 | 1 | 21`
```
Candid smartphone photo in the same Vietnamese ward sports hall, slight camera-shake motion blur over the whole image. Red-and-white flip scoreboard on the scorer's desk, frontal. Exactly four flip cards, left to right: large "23", small "2", small "1", large "21". Digits smeared horizontally but distinguishable. Digits must read exactly 23, 2, 1, 21. [NEG]
```
**muse09** — T3 ván 4, độ khó 4 (tay trọng tài che ¼ lá lớn trái). Nhãn `19 | 2 | 2 | 21`
```
Candid smartphone photo in the same Vietnamese ward sports hall. The umpire's hand rests on the top edge of the leftmost large card of the red-and-white flip scoreboard, covering about a quarter of it. Exactly four flip cards, left to right: large "19", small "2", small "2", large "21". True numbers are exactly 19, 2, 2, 21 even though partly covered. [NEG]
```
**muse10** — T3 ván 5, độ khó 5 (chữ số tròn đậm dễ nhầm 3/8, nghiêng + tối). Nhãn `21 | 3 | 2 | 13`
```
Candid smartphone photo in the same Vietnamese ward sports hall with half the lights switched off, dim, shot at an angle with mild blur. Red-and-white flip scoreboard with bold rounded digits where 3 and 8 look alike. Exactly four flip cards, left to right: large "21", small "3", small "2", large "13". Winning doubles team celebrating in the background. Digits must read exactly 21, 3, 2, 13. [NEG]
```

## Trận 4 — BO5, B thắng 3-1 (4 ván)
Cảnh chung: sân thuê trong nhà xưởng mái tôn, đèn vàng, bảng lật trắng trên giá sắt cạnh lưới, đơn nam.

**muse11** — T4 ván 1, độ khó 2 (nghiêng ~40° phải, xa ~5 m). Nhãn `21 | 1 | 0 | 11`
```
Candid smartphone photo in a rented badminton court inside a metal-roof warehouse in Vietnam, warm yellow lights. White flip scoreboard on a metal stand next to the net, shot from about 5 meters away and 40 degrees to the right. Exactly four flip cards, left to right: large "21", small "1", small "0", large "11". Digits must read exactly 21, 1, 0, 11. [NEG]
```
**muse12** — T4 ván 2, độ khó 3 (ngược sáng, bảng tối). Nhãn `17 | 1 | 1 | 21`
```
Candid smartphone photo in the same warehouse badminton court, backlit by a bright open roller door behind the white flip scoreboard, which is underexposed and dark. Exactly four flip cards, left to right: large "17", small "1", small "1", large "21". Silhouetted players. Digits must read exactly 17, 1, 1, 21. [NEG]
```
**muse13** — T4 ván 3, độ khó 4 (vợt dựng chéo che 2 lá phải). Nhãn `26 | 1 | 2 | 28`
```
Candid smartphone photo in the same warehouse badminton court. A badminton racket without brand text leans across the front of the white flip scoreboard, its frame covering part of the two right-hand cards. Exactly four flip cards, left to right: large "26", small "1", small "2", large "28". True numbers are exactly 26, 1, 2, 28. [NEG]
```
**muse14** — T4 ván 4, độ khó 5 (hai bảng trong khung: bảng gần là trận này, bảng xa là sân bên). Nhãn bảng gần `14 | 1 | 3 | 21`; bảng xa (gây nhiễu, không chấm) `9 | 0 | 0 | 7`
```
Candid smartphone photo in the same warehouse with two adjacent badminton courts. Two white flip scoreboards visible: one in the foreground, larger and closer, one on the neighboring court further back. Foreground board, exactly four cards left to right: large "14", small "1", small "3", large "21". Background board, exactly four cards left to right: large "9", small "0", small "0", large "7". No other numbers. [NEG]
```

## Trận 5 — BO3, B thắng 2-1 (đủ 3 ván, ván 3 chạm 30)
Cảnh chung: sân ngoài trời trong trường học, buổi chiều tối chuyển sang đêm, bảng lật xanh trên ghế nhựa, đơn nữ.

**muse15** — T5 ván 1, độ khó 1. Nhãn `21 | 1 | 0 | 9`
```
Candid smartphone photo at an outdoor school badminton court in Vietnam, late afternoon light. Close frontal view of a blue flip scoreboard with white digits on a plastic chair. Exactly four flip cards, left to right: large "21", small "1", small "0", large "9". Sharp. Two women players drinking water in the background. Digits must read exactly 21, 1, 0, 9. [NEG]
```
**muse16** — T5 ván 2, độ khó 4 (người đi ngang che ⅓ lá lớn trái). Nhãn `18 | 1 | 1 | 21`
```
Candid smartphone photo at the same outdoor school badminton court, dusk. A spectator walking past in the foreground, slightly blurred, blocks the left third of the leftmost large card of the blue flip scoreboard. Exactly four flip cards, left to right: large "18", small "1", small "1", large "21". True numbers are exactly 18, 1, 1, 21. [NEG]
```
**muse17** — T5 ván 3, độ khó 5 (đêm, đèn đường yếu, lá nhỏ bên phải đang lật dở từ 1 sang 2). Nhãn (sau khi lật xong) `29 | 1 | 2 | 30`
```
Candid smartphone photo at night at the same outdoor school badminton court, lit by one weak yellow street lamp, grainy. Blue flip scoreboard on the plastic chair; a hand is mid-flip on the small right-middle card, page half turned showing the top half of "2" over the bottom half of "1". Other cards, left to right: large "29", small "1", large "30". No other numbers. [NEG]
```

## Trận 6 — BO5, A thắng 3-0 (3 ván)
Cảnh chung: CLB cầu lông trong nhà có rèm chắn gió, bảng lật trắng chữ số mảnh, đôi nam nữ.

**muse18** — T6 ván 1, độ khó 2 (chụp chéo từ trên xuống). Nhãn `21 | 1 | 0 | 6`
```
Candid smartphone photo in an indoor Vietnamese badminton club with wind curtains. Shot from above at a steep diagonal looking down at a white flip scoreboard on the floor beside the court. Exactly four flip cards, left to right: large "21", small "1", small "0", large "6". Visible keystone distortion, still readable. Mixed doubles players in background. Digits must read exactly 21, 1, 0, 6. [NEG]
```
**muse19** — T6 ván 2, độ khó 3 (thiếu sáng, nhiễu hạt). Nhãn `21 | 2 | 0 | 19`
```
Candid smartphone photo in the same indoor Vietnamese badminton club, several lights off, dim and grainy. White flip scoreboard on the floor, frontal. Exactly four flip cards, left to right: large "21", small "2", small "0", large "19". Low contrast, digits barely but genuinely readable. Digits must read exactly 21, 2, 0, 19. [NEG]
```
**muse20** — T6 ván 3, độ khó 5 (chữ số mảnh dễ nhầm 0/8/3, nghiêng). Nhãn `30 | 3 | 0 | 28`
```
Candid smartphone photo in the same indoor Vietnamese badminton club, slightly angled. White flip scoreboard with thin narrow digits where 0, 3 and 8 look similar. Exactly four flip cards, left to right: large "30", small "3", small "0", large "28". Mixed doubles pair celebrating. Digits must read exactly 30, 3, 0, 28. [NEG]
```

---

## Bảng nhãn

| Mã | Trận | Thể thức | Ván | Độ khó | Bảng (A điểm \| A ván \| B ván \| B điểm) |
|---|---|---|---|---|---|
| muse01 | T1 | BO3 | 1 | 1 | 21 \| 1 \| 0 \| 17 |
| muse02 | T1 | BO3 | 2 | 2 | 19 \| 1 \| 1 \| 21 |
| muse03 | T1 | BO3 | 3 | 3 | 21 \| 2 \| 1 \| 15 |
| muse04 | T2 | BO3 | 1 | 1 | 12 \| 0 \| 1 \| 21 |
| muse05 | T2 | BO3 | 2 | 4 | 20 \| 0 \| 2 \| 22 |
| muse06 | T3 | BO5 | 1 | 1 | 21 \| 1 \| 0 \| 18 |
| muse07 | T3 | BO5 | 2 | 2 | 16 \| 1 \| 1 \| 21 |
| muse08 | T3 | BO5 | 3 | 3 | 23 \| 2 \| 1 \| 21 |
| muse09 | T3 | BO5 | 4 | 4 | 19 \| 2 \| 2 \| 21 |
| muse10 | T3 | BO5 | 5 | 5 | 21 \| 3 \| 2 \| 13 |
| muse11 | T4 | BO5 | 1 | 2 | 21 \| 1 \| 0 \| 11 |
| muse12 | T4 | BO5 | 2 | 3 | 17 \| 1 \| 1 \| 21 |
| muse13 | T4 | BO5 | 3 | 4 | 26 \| 1 \| 2 \| 28 |
| muse14 | T4 | BO5 | 4 | 5 | 14 \| 1 \| 3 \| 21 (bảng xa 9-0-0-7 gây nhiễu) |
| muse15 | T5 | BO3 | 1 | 1 | 21 \| 1 \| 0 \| 9 |
| muse16 | T5 | BO3 | 2 | 4 | 18 \| 1 \| 1 \| 21 |
| muse17 | T5 | BO3 | 3 | 5 | 29 \| 1 \| 2 \| 30 (lá B-ván đang lật 1→2) |
| muse18 | T6 | BO5 | 1 | 2 | 21 \| 1 \| 0 \| 6 |
| muse19 | T6 | BO5 | 2 | 3 | 21 \| 2 \| 0 \| 19 |
| muse20 | T6 | BO5 | 3 | 5 | 30 \| 3 \| 0 \| 28 |

**Kết quả chung cuộc từng trận** (dùng để chấm tầng "ráp kết quả trận"):

| Trận | Thể thức | Chung cuộc | Các ván (A-B) |
|---|---|---|---|
| T1 | BO3 | A 2-1 | 21-17, 19-21, 21-15 |
| T2 | BO3 | B 2-0 | 12-21, 20-22 |
| T3 | BO5 | A 3-2 | 21-18, 16-21, 23-21, 19-21, 21-13 |
| T4 | BO5 | B 3-1 | 21-11, 17-21, 26-28, 14-21 |
| T5 | BO3 | B 2-1 | 21-9, 18-21, 29-30 |
| T6 | BO5 | A 3-0 | 21-6, 21-19, 30-28 |

Phân bố độ khó: mức 1 = 01,04,06,15 · mức 2 = 02,07,11,18 · mức 3 = 03,08,12,19 · mức 4 = 05,09,13,16 · mức 5 = 10,14,17,20.

## Nhắc PO

1. Đọc lại tỉ số trên từng ảnh và so với bảng nhãn. Ảnh sai thì tạo lại, hoặc sửa nhãn theo ảnh thật. Nếu sửa nhãn thì kiểm tra lại cả trận: số ván thắng ở các ảnh sau phải khớp, và kết quả chung cuộc vẫn hợp luật.
2. Giữ cảnh nhất quán trong một trận. Nếu Muse cho phép dùng ảnh tham chiếu, lấy ảnh ván 1 làm tham chiếu cho các ván sau.
3. Lưu ảnh tên `muse01.png` đến `muse20.png` vào `ai-notes/eval/samples-internet/muse20/`.
4. muse14 và muse17: chỉ chấm theo bảng gần hoặc theo tỉ số sau khi lật. Nếu ảnh mơ hồ, ghi cả hai cách đọc.
5. Báo cáo bộ này ở mục riêng, ghi rõ là ảnh AI tạo.
