-- AlterTable
ALTER TABLE "match_result_cases" ADD COLUMN     "declarationReminderAt" TIMESTAMPTZ(3),
ADD COLUMN     "responseReminderAt" TIMESTAMPTZ(3);
