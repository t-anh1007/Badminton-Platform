# Streamlined Dispute Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a booking-first player dispute flow with required contact phone and up to five directly uploaded evidence images, plus a focused Admin queue/detail decision flow.

**Architecture:** Extend the existing finance dispute aggregate with a contact-phone snapshot and owned object-storage keys. Keep finance policy and resolution transactions unchanged; expose upload authorization and read URLs at the HTTP boundary, then reshape the two React panels around the existing API operations.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Express, Zod, Prisma/PostgreSQL, S3-compatible object storage, Vitest, Testing Library, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-10-dispute-ux-redesign-design.md`

## Global Constraints

- Keep the approved 24-hour dispute window and three Admin outcomes unchanged.
- Preserve append-only ledger behavior and the three-way refund reversal.
- Contact phone is required per dispute, prefilled from profile when available, editable, and never writes back to the profile implicitly.
- Evidence accepts at most five JPEG, PNG, or WebP images.
- Keep old URL-based evidence readable for existing records.
- Do not stage or modify the unrelated `docs/screenshots/` tree.
- Do not commit implementation work without new user authorization.

## Progress

- 2026-09-10: Tasks 1–4 implemented. Contact-phone snapshot, five-image owned upload boundary, booking-first player UI, and Admin queue/detail decision UI are in place.
- 2026-09-10: Product spec aligned. Focused evidence: object storage 10 tests passed; finance dispute/HTTP 12 tests passed; player/Admin web surfaces 18 tests passed.
- 2026-09-10: User chose focused typecheck/build. `@khoaluantn/object-storage` build passed and `@khoaluantn/finance-service` typecheck passed after rebuilding the local object-storage declaration.
- Remaining: web build is blocked by the pre-existing `src/lib/matchApi.ts:59` `MatchDetail.status` incompatibility; the dispute-focused web tests remain green. Keep this plan active until that external build blocker is resolved or explicitly accepted.

## File Structure

- `packages/object-storage/src/index.ts`: add the finance dispute evidence namespace.
- `packages/object-storage/test/objectKeys.test.ts`: prove namespace ownership and validation.
- `services/finance-service/prisma/schema.prisma`: persist `contactPhone` on disputes.
- `services/finance-service/prisma/migrations/20260910090000_dispute_contact_phone/migration.sql`: additive nullable migration for legacy rows; application requires the value for new rows.
- `services/finance-service/src/app.ts`: inject and resolve object storage for finance routes.
- `services/finance-service/src/routes/disputeUploads.ts`: authorize owned evidence uploads.
- `services/finance-service/src/routes/financeOperations.ts`: validate input, verify uploaded objects, and map stored keys to read URLs.
- `services/finance-service/src/domain/dispute.ts`: validate and snapshot contact phone; cap evidence at five.
- `services/finance-service/test/g7Dispute.test.ts`: domain validation and persistence proof.
- `services/finance-service/test/g7Http.test.ts`: HTTP/upload/read URL contract proof.
- `apps/web/src/lib/financeApi.ts`: add contact phone and evidence upload APIs/types.
- `apps/web/src/components/DisputePanel.tsx`: booking-first player flow.
- `apps/web/src/components/DisputeAdminPanel.tsx`: Admin queue/detail decision flow.
- `apps/web/src/pages/accountVenueFinanceSurfaces.test.tsx`: player interaction proof.
- `apps/web/src/pages/admin/adminOperations.test.tsx`: Admin interaction proof.
- `docs/product/specs/finance-disputes.md`: record the approved contact and image-evidence contract.

---

### Task 1: Persist and validate dispute contact information

**Files:**
- Modify: `services/finance-service/prisma/schema.prisma`
- Create: `services/finance-service/prisma/migrations/20260910090000_dispute_contact_phone/migration.sql`
- Modify: `services/finance-service/src/domain/dispute.ts`
- Test: `services/finance-service/test/g7Dispute.test.ts`

**Interfaces:**
- Produces: `CreateDisputeInput` containing `contactPhone: string` and `evidence: string[]` capped at five.
- Produces: stored `Dispute.contactPhone: string | null`; new disputes always contain a normalized phone.

- [ ] **Step 1: Write failing domain tests**

Add cases that create with `contactPhone: '090 123-4567'` and expect `0901234567`, and reject missing/invalid phones and six evidence keys.

```ts
const dispute = await createDispute(playerId, {
  bookingId, reason: 'Sân đóng cửa', contactPhone: '090 123-4567', evidence: [],
});
expect(dispute.contactPhone).toBe('0901234567');
await expect(createDispute(playerId, { bookingId, reason: 'x', contactPhone: '123', evidence: [] }))
  .rejects.toMatchObject({ name: 'ZodError' });
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test --workspace @khoaluantn/finance-service -- g7Dispute.test.ts`

Expected: FAIL because `contactPhone` is not in the schema/model.

- [ ] **Step 3: Add the additive schema and migration**

Add `contactPhone String?` to `Dispute`; migration SQL:

```sql
ALTER TABLE "disputes" ADD COLUMN "contactPhone" TEXT;
```

Keep it nullable for historical rows; require it in the create schema for all new requests.

- [ ] **Step 4: Implement normalization and evidence cap**

Add a transform accepting `0` plus nine digits or `+84` plus nine digits and normalizing the latter to a leading `0`. Set `evidence.max(5)` and pass the normalized phone to `tx.dispute.create`.

- [ ] **Step 5: Generate Prisma client and rerun the focused test**

Run: `npm run prisma:generate --workspace @khoaluantn/finance-service`

Run: `npm test --workspace @khoaluantn/finance-service -- g7Dispute.test.ts`

Expected: PASS.

### Task 2: Add owned dispute evidence uploads and read URLs

**Files:**
- Modify: `packages/object-storage/src/index.ts`
- Modify: `packages/object-storage/test/objectKeys.test.ts`
- Modify: `services/finance-service/package.json`
- Modify: `services/finance-service/src/app.ts`
- Create: `services/finance-service/src/routes/disputeUploads.ts`
- Modify: `services/finance-service/src/routes/financeOperations.ts`
- Test: `services/finance-service/test/g7Http.test.ts`

**Interfaces:**
- Produces: `POST /players/me/dispute-evidence-upload` with `{ mimeType }`, returning `{ objectKey, uploadUrl, headers, expiresAt }`.
- Consumes: `ObjectStorageClient.authorizeUpload`, `assertOwnedObject`, and `getReadUrl` with namespace `finance/disputes`.
- Produces: dispute read DTOs where stored object keys are replaced by browser-usable read URLs; legacy `http(s)` evidence remains unchanged.

- [ ] **Step 1: Write failing object-storage and HTTP tests**

```ts
expect(buildOwnedObjectKey({
  namespace: 'finance/disputes', ownerUserId, mimeType: 'image/webp', nonce: 'proof',
})).toBe(`finance/disputes/${ownerUserId}/proof.webp`);
```

Inject a fake `ObjectStorageClient` into `createApp`, assert a player can authorize upload, another namespace/user key is rejected on dispute creation, and Admin reads a signed URL.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test --workspace @khoaluantn/object-storage -- objectKeys.test.ts`

Run: `npm test --workspace @khoaluantn/finance-service -- g7Http.test.ts`

Expected: FAIL because the namespace, route and dependency injection do not exist.

- [ ] **Step 3: Add the namespace and finance dependency**

Extend `ObjectNamespace` with `'finance/disputes'` and add `@khoaluantn/object-storage` as a finance-service workspace dependency.

- [ ] **Step 4: Implement upload authorization and object verification**

Create `createDisputeUploadRouter(resolveStorage)` mirroring the community upload router. In dispute creation, infer MIME from each key suffix and call:

```ts
await storage.assertOwnedObject({
  objectKey, namespace: 'finance/disputes', ownerUserId: userId,
  mimeType, maxBytes: MAX_IMAGE_BYTES,
});
```

Skip object verification only for legacy `https://` evidence accepted by existing records, not for new create requests. Convert stored keys through `getReadUrl` in player/Admin list responses.

- [ ] **Step 5: Rerun object-storage and finance HTTP tests**

Expected: PASS for both focused commands.

### Task 3: Build the booking-first player flow

**Files:**
- Modify: `apps/web/src/lib/financeApi.ts`
- Modify: `apps/web/src/components/DisputePanel.tsx`
- Test: `apps/web/src/pages/accountVenueFinanceSurfaces.test.tsx`

**Interfaces:**
- Produces: `authorizeDisputeEvidence(mimeType)` and `uploadDisputeEvidence(authorization, file, onProgress)`.
- Consumes: reusable `ImageUploadPicker`, `getMyProfile`, eligible bookings and disputes.
- Produces: `createDispute({ bookingId, reason, contactPhone, evidence })`.

- [ ] **Step 1: Replace the existing player test with failing booking-first cases**

Assert that the UI shows a business-readable booking card, opens the form through **Báo vấn đề**, prefills profile phone, requires category/detail, uploads at most five images, and sends only successful object keys.

```ts
expect(createDispute).toHaveBeenCalledWith({
  bookingId: 'booking-must-not-render',
  reason: 'Sân đóng cửa / không thể chơi — Cổng sân khóa khi tôi đến.',
  contactPhone: '0901234567',
  evidence: ['finance/disputes/player/photo.webp'],
});
```

- [ ] **Step 2: Run the focused web test and verify failure**

Run: `npm test --workspace @khoaluantn/web -- accountVenueFinanceSurfaces.test.tsx`

Expected: FAIL against the dropdown/textarea UI.

- [ ] **Step 3: Implement typed API helpers**

Extend `DisputeRow.contactPhone`, update `createDispute`, and add upload authorization/PUT helpers following `communityApi.ts`.

- [ ] **Step 4: Implement the player component**

Use booking cards, an inline radio group of five categories, required detail and telephone inputs, and `ImageUploadPicker` with `maxFiles={5}`. Keep submit disabled during upload/errors and render friendly status cards after creation.

- [ ] **Step 5: Rerun the focused player test**

Expected: PASS.

### Task 4: Build the Admin queue/detail decision flow

**Files:**
- Modify: `apps/web/src/components/DisputeAdminPanel.tsx`
- Modify: `apps/web/src/pages/admin/AdminDisputesPage.tsx`
- Test: `apps/web/src/pages/admin/adminOperations.test.tsx`

**Interfaces:**
- Consumes: `DisputeRow.contactPhone`, signed evidence URLs and existing `resolveDispute`.
- Produces: one selected dispute, one selected decision, conditional partial amount, required reason and a confirmation modal.

- [ ] **Step 1: Write failing Admin interaction tests**

Assert open-first queue selection, `href="tel:0901234567"`, evidence thumbnails, conditional amount input, one **Xem lại & xác nhận** button and the unchanged resolve payload.

- [ ] **Step 2: Run the focused Admin test and verify failure**

Run: `npm test --workspace @khoaluantn/web -- adminOperations.test.tsx`

Expected: FAIL against per-card free-form inputs and three immediate buttons.

- [ ] **Step 3: Implement responsive queue/detail layout**

Use a responsive `lg:grid-cols-[minmax(16rem,.8fr)_minmax(0,1.7fr)]`. Sort open disputes before resolved ones and deadline ascending within open rows. Keep ledger under `<details>`.

- [ ] **Step 4: Implement decision controls and confirmation**

Render the amount field only for `partial_refund`, validate against `revenue.gross`, show a summary modal and keep values after API failure.

- [ ] **Step 5: Rerun the focused Admin test**

Expected: PASS.

### Task 5: Align product truth and validate the integrated change

**Files:**
- Modify: `docs/product/specs/finance-disputes.md`
- Modify: `docs/plans/active/2026-09-10-dispute-ux-redesign.md`

**Interfaces:**
- Produces: current FIN-12 input/UX contract and recorded validation evidence.

- [ ] **Step 1: Update FIN-12**

Record required contact-phone snapshot, direct upload of at most five JPEG/PNG/WebP images, and the booking-first interaction without changing the financial acceptance criteria.

- [ ] **Step 2: Run focused tests**

Run:

```powershell
npm test --workspace @khoaluantn/object-storage -- objectKeys.test.ts
npm test --workspace @khoaluantn/finance-service -- g7Dispute.test.ts g7Http.test.ts
npm test --workspace @khoaluantn/web -- accountVenueFinanceSurfaces.test.tsx adminOperations.test.tsx
```

Expected: all focused suites PASS.

- [ ] **Step 3: Run read-only impact checks**

Run `git diff --check`, inspect `git status --short`, and confirm only planned files changed plus the pre-existing untracked `docs/screenshots/`.

- [ ] **Step 4: Record evidence and request broad-check choice**

Update this plan with focused results and remaining risks. Per COURTIN workflow, ask the user whether to run focused build/typecheck, broader tests, both, or neither before moving the plan to completed.
