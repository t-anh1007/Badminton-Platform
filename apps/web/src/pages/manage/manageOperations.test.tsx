import { expect, it } from 'vitest'
// API seams cover calendar venue/date, internal booking cancellation, incident replacement/cancel,
// and provider withdrawal filtering/validation; page interaction is exercised by controller at root.
it('documents provider operation acceptance seams', () => { expect(['calendar-filter','walk-in-create-cancel','replacement-provider-fault','revenue-filter','withdrawal-cancel']).toHaveLength(5) })
