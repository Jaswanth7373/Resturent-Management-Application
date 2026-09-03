const express = require('express');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { autoAssignWaiter } = require('../lib/assignWaiter');

module.exports = (io) => {
  const router = express.Router();

  router.get('/:branchId', (req, res) => {
    const tables = db.get('tables').filter({ branchId: req.params.branchId }).value().map(t => {
      if (!t.assignedWaiterId) return { ...t, assignedWaiterName: null };
      const waiter = db.get('users').find({ id: t.assignedWaiterId }).value();
      return { ...t, assignedWaiterName: waiter ? waiter.name : null };
    });
    res.json(tables);
  });

  router.patch('/:branchId/:tableId', authRequired, requireRole('waiter', 'sub_admin', 'restaurant_admin'), (req, res) => {
    const { branchId, tableId } = req.params;
    const { status } = req.body;
    const table = db.get('tables').find({ id: tableId, branchId });
    if (!table.value()) return res.status(404).json({ error: 'Table not found' });

    const updates = { status };
    if (status === 'occupied' && !table.value().assignedWaiterId) {
      const waiter = autoAssignWaiter(branchId);
      if (waiter) updates.assignedWaiterId = waiter.id;
    }
    if (status === 'available') updates.assignedWaiterId = null;

    table.assign(updates).write();
    io.to(`branch:${branchId}`).emit('table:updated', table.value());
    res.json(table.value());
  });

  // Waiter can pull a table onto themselves (e.g. covering for a colleague, or the auto-assignment
  // picked wrong because nobody was clocked in yet)
  router.patch('/:branchId/:tableId/assign-to-me', authRequired, requireRole('waiter'), (req, res) => {
    const { branchId, tableId } = req.params;
    const table = db.get('tables').find({ id: tableId, branchId });
    if (!table.value()) return res.status(404).json({ error: 'Table not found' });
    table.assign({ assignedWaiterId: req.user.id }).write();
    io.to(`branch:${branchId}`).emit('table:updated', table.value());
    res.json(table.value());
  });

  // Customer/guest calls the waiter (assistance) or asks for the bill - no login required
  router.post('/:branchId/:tableId/request', (req, res) => {
    const { branchId, tableId } = req.params;
    const { type } = req.body; // 'assistance' | 'bill'
    const table = db.get('tables').find({ id: tableId, branchId });
    if (!table.value()) return res.status(404).json({ error: 'Table not found' });
    const request = { type: type === 'bill' ? 'bill' : 'assistance', at: new Date().toISOString() };
    table.assign({ request }).write();
    io.to(`branch:${branchId}`).emit('table:request', { tableId, ...request, tableName: table.value().name });
    io.to(`branch:${branchId}`).emit('table:updated', table.value());
    res.json(table.value());
  });

  // Waiter acknowledges/clears a pending table request
  router.patch('/:branchId/:tableId/request/clear', authRequired, requireRole('waiter', 'sub_admin', 'restaurant_admin'), (req, res) => {
    const { branchId, tableId } = req.params;
    const table = db.get('tables').find({ id: tableId, branchId });
    if (!table.value()) return res.status(404).json({ error: 'Table not found' });
    table.assign({ request: null }).write();
    io.to(`branch:${branchId}`).emit('table:updated', table.value());
    res.json(table.value());
  });

  // Merge tables: move all active (non-final) orders from one table onto another, freeing the source table
  router.post('/:branchId/merge', authRequired, requireRole('waiter', 'sub_admin', 'restaurant_admin'), (req, res) => {
    const { branchId } = req.params;
    const { fromTableId, toTableId } = req.body;
    if (!fromTableId || !toTableId || fromTableId === toTableId) {
      return res.status(400).json({ error: 'fromTableId and toTableId are required and must differ' });
    }
    const fromTable = db.get('tables').find({ id: fromTableId, branchId }).value();
    const toTable = db.get('tables').find({ id: toTableId, branchId }).value();
    if (!fromTable || !toTable) return res.status(404).json({ error: 'Table not found' });

    const finalStatuses = ['completed', 'cancelled', 'rejected'];
    const movedOrders = db.get('orders')
      .filter(o => o.branchId === branchId && o.tableId === fromTableId && !finalStatuses.includes(o.status))
      .value();

    movedOrders.forEach(o => {
      db.get('orders').find({ id: o.id }).assign({ tableId: toTableId, mergedFrom: fromTableId }).write();
      io.to(`branch:${branchId}`).emit('order:updated', db.get('orders').find({ id: o.id }).value());
    });

    const toTableBefore = db.get('tables').find({ id: toTableId }).value();
    db.get('tables').find({ id: toTableId }).assign({
      status: 'occupied',
      assignedWaiterId: toTableBefore.assignedWaiterId || fromTable.assignedWaiterId || null
    }).write();
    db.get('tables').find({ id: fromTableId }).assign({ status: 'available', request: null, assignedWaiterId: null }).write();

    io.to(`branch:${branchId}`).emit('table:updated', db.get('tables').find({ id: toTableId }).value());
    io.to(`branch:${branchId}`).emit('table:updated', db.get('tables').find({ id: fromTableId }).value());

    res.json({ success: true, movedOrders: movedOrders.length, toTableId, fromTableId });
  });

  return router;
};
