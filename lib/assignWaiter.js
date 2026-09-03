const { db } = require('../db');

// Picks the best waiter to hand a newly-occupied table to: prefers waiters who are
// currently clocked in (an open attendance shift), then whichever of them currently
// has the fewest occupied tables assigned (simple load-balancing). Falls back to any
// waiter on the branch if nobody's clocked in, so a table is never left unowned.
function autoAssignWaiter(branchId) {
  const waiters = db.get('users').filter({ branchId, role: 'waiter' }).value().filter(w => w.active !== false);
  if (waiters.length === 0) return null;

  const openShiftUserIds = new Set(
    db.get('attendance').filter(a => a.branchId === branchId && a.role === 'waiter' && !a.clockOut).value().map(a => a.userId)
  );
  let pool = waiters.filter(w => openShiftUserIds.has(w.id));
  if (pool.length === 0) pool = waiters; // nobody clocked in — assign anyway rather than leaving the table orphaned

  const load = (waiterId) => db.get('tables').filter({ branchId, assignedWaiterId: waiterId, status: 'occupied' }).value().length;
  pool = pool.slice().sort((a, b) => load(a.id) - load(b.id));
  return pool[0];
}

module.exports = { autoAssignWaiter };
