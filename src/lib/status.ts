/**
 * The one status-to-class convention (constraints.md, "Status mapping").
 * Status text is always rendered by the caller; this only picks the badge class.
 *
 *   PENDING                          -> status-warning
 *   APPROVED / AWAITING_PICKUP       -> status-approved  (ready / your turn)
 *   COMPLETED / DONE / PAID / RETURNED -> status-success
 *   REJECTED / FAILED                -> status-danger
 *   anything else, incl. CANCELLED   -> neutral (a cancellation is not an error)
 *
 * `overrides` maps a page-specific status onto a class, e.g. `{ HELD: 'status-warning' }`;
 * it wins over the convention.
 */
const NEUTRAL = 'badge recessed text-muted';

const BASE: Record<string, string> = {
  PENDING: 'status-warning',
  APPROVED: 'status-approved',
  AWAITING_PICKUP: 'status-approved',
  COMPLETED: 'status-success',
  DONE: 'status-success',
  PAID: 'status-success',
  RETURNED: 'status-success',
  REJECTED: 'status-danger',
  FAILED: 'status-danger',
};

export function statusClass(status: string, overrides?: Record<string, string>): string {
  return overrides?.[status] ?? BASE[status] ?? NEUTRAL;
}
