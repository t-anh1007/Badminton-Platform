-- BR-CM-26/42: hồ sơ kết quả append-only cả với DELETE. Chỉ phiên đặt
-- `SET LOCAL app.result_audit_purge = 'on'` (dọn dữ liệu test cục bộ) mới được xóa.
CREATE OR REPLACE FUNCTION "reject_result_audit_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.result_audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'RESULT_AUDIT_IMMUTABLE: % is append-only', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION "guard_result_evidence_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.result_audit_purge', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL
     AND (to_jsonb(NEW) - 'deletedAt') = (to_jsonb(OLD) - 'deletedAt') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'RESULT_EVIDENCE_IMMUTABLE: committed evidence cannot change';
END;
$$;

CREATE TRIGGER "result_claims_no_delete" BEFORE DELETE ON "result_claims" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();
CREATE TRIGGER "result_sets_no_delete" BEFORE DELETE ON "result_sets" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();
CREATE TRIGGER "result_responses_no_delete" BEFORE DELETE ON "result_responses" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();
CREATE TRIGGER "provider_recommendations_no_delete" BEFORE DELETE ON "provider_recommendations" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();
CREATE TRIGGER "admin_result_decisions_no_delete" BEFORE DELETE ON "admin_result_decisions" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();
CREATE TRIGGER "result_evidence_no_delete" BEFORE DELETE ON "result_evidence" FOR EACH ROW EXECUTE FUNCTION "guard_result_evidence_update"();
