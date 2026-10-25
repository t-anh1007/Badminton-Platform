-- BR-RA-30: một đội bấm "Đã nộp đủ" trong 2h nộp bằng chứng (cả hai đội bấm thì đóng sớm).
ALTER TYPE "ResultResponseKind" ADD VALUE 'evidence_done';
