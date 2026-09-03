const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

function todayStr() { return new Date().toISOString().slice(0, 10); }

module.exports = (io) => {
  const router = express.Router();

  // Clock in for the current shift (waiter/chef/sub_admin/inventory_manager)
  router.post('/:branchId/clock-in', authRequired, requireRole('waiter', 'chef', 'sub_admin', 'inventory_manager'), (req, res) => {
    const { branchId } = req.params;
    const openShift = db.get('attendance')
      .find(a => a.branchId === branchId && a.userId === req.user.id && !a.clockOut)
      .value();
    if (openShift) return res.status(409).json({ error: 'Already clocked in for an open shift' });

    const record = {
      id: nanoid(), branchId, userId: req.user.id, userName: req.user.name, role: req.user.role,
      date: todayStr(), clockIn: new Date().toISOString(), clockOut: null
    };
    db.get('attendance').push(record).write();
    io.to(`branch:${branchId}`).emit('attendance:updated', record);
    res.status(201).json(record);
  });

  // Clock out of the current open shift
  router.patch('/:branchId/clock-out', authRequired, requireRole('waiter', 'chef', 'sub_admin', 'inventory_manager'), (req, res) => {
    const { branchId } = req.params;
    const shiftRef = db.get('attendance').find(a => a.branchId === branchId && a.userId === req.user.id && !a.clockOut);
    const shift = shiftRef.value();
    if (!shift) return res.status(404).json({ error: 'No open shift found' });
    shift.clockOut = new Date().toISOString();
    shift.durationMinutes = Math.round((new Date(shift.clockOut) - new Date(shift.clockIn)) / 60000);
    shiftRef.assign(shift).write();
    io.to(`branch:${branchId}`).emit('attendance:updated', shift);
    res.json(shift);
  });

  // My current status + today's shifts (any staff role, self only)
  router.get('/:branchId/me', authRequired, requireRole('waiter', 'chef', 'sub_admin', 'inventory_manager'), (req, res) => {
    const { branchId } = req.params;
    const mine = db.get('attendance').filter(a => a.branchId === branchId && a.userId === req.user.id).value()
      .sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
    res.json({ open: mine.find(a => !a.clockOut) || null, history: mine.slice(0, 20) });
  });

  // Full branch attendance (Sub-Admin / Restaurant Admin / Super Admin view)
  router.get('/:branchId', authRequired, requireRole('sub_admin', 'restaurant_admin', 'super_admin'), (req, res) => {
    const { branchId } = req.params;
    const { date } = req.query;
    let records = db.get('attendance').filter({ branchId }).value();
    if (date) records = records.filter(r => r.date === date);
    records = records.slice().sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
    res.json(records);
  });

  return router;
};
