/**
 * The practitioner frontend's data layer. Import from '@/lib/client'.
 *
 * OWNER: Stream 2.
 */
export * as api from './api'
export {
  ApiClientError,
  ApiNetworkError,
  ApiShapeError,
} from './http'
export { USE_MOCK_API } from './transport'
export {
  clearSession,
  getReminderLinkId,
  getSessionToken,
  reminderLinkIdFromUrl,
  setReminderLinkId,
  setSessionToken,
} from './session'
export {
  CONTRACT_DEFAULTS,
  loadEntryDefaults,
  saveEntryDefaults,
  type EntryDefaults,
} from './preferences'
export { searchConditions, type SearchableCondition } from './condition-search'
export { loadTaxonomy, readCachedTaxonomy } from './taxonomy-cache'
export {
  flushOutbox,
  pendingFor,
  queueLog,
  readOutbox,
  removeFromOutbox,
  type QueuedLog,
} from './outbox'
export { clearDraft, loadDraft, saveDraft } from './draft'
