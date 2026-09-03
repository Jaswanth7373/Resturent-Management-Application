const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { autoAssignWaiter } = require('../lib/assignWaiter');

// A reservation is "due now" from 15 minutes before its slot to 60 minutes after —
// the window front-of-house actually cares about, vs. a distant booking three days out.
function isDueNow(r) {
  if (r.status !== 'confirmed') return false;
  const slot = new Date(`${r.date}T${r.time}`);
  const now = new Date();
  const diffMin = (now - slot) / 60000;
  return diffMin >= -15 && diffMin <= 60;
}

module.exports = (io) => {
  const router = express.Router();

  router.post('/:branchId', (req, res) => {
    const { branchId } = req.params;
    const { customerName, phone, date, time, guests, occasion, preorderItems, notes } = req.body;
    if (!customerName || !date || !time || !guests) {
      return res.status(400).json({ error: 'customerName, date, time, guests are required' });
    }

    // Auto-assign the smallest available table that comfortably fits the party, and hold it
    // as "reserved" so it doesn't get taken by a walk-in before the guest arrives.
    const candidates = db.get('tables').filter({ branchId, status: 'available' }).value()
      .filter(t => t.seats >= guests)
      .sort((a, b) => a.seats - b.seats);
    const assignedTable = candidates[0] || null;
    if (assignedTable) {
      db.get('tables').find({ id: assignedTable.id }).assign({ status: 'reserved' }).write();
      io.to(`branch:${branchId}`).emit('table:updated', db.get('tables').find({ id: assignedTable.id }).value());
    }

    const reservation = {
      id: nanoid(), branchId, customerName, phone: phone || '', date, time,
      guests, occasion: occasion || null, preorderItems: preorderItems || [], notes: notes || '',
      tableId: assignedTable ? assignedTable.id : null,
      status: 'confirmed', createdAt: new Date().toISOString()
    };
    db.get('reservations').push(reservation).write();
    io.to(`branch:${branchId}`).emit('reservation:new', reservation);
    res.status(201).json({ ...reservation, tableAssigned: !!assignedTable });
  });

  router.get('/:branchId', (req, res) => {
    const reservations = db.get('reservations').filter({ branchId: req.params.branchId }).value()
      .map(r => ({ ...r, isDueNow: isDueNow(r) }))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    res.json(reservations);
  });

  // Front-of-house seats the guest: reservation's table (or a manually-picked one) flips to
  // occupied and gets a waiter assigned, same as any other newly-occupied table.
  router.patch('/:branchId/:id/seat', authRequired, requireRole('waiter', 'sub_admin', 'restaurant_admin'), (req, res) => {
    const { branchId, id } = req.params;
    const { tableId } = req.body;
    const resRef = db.get('reservations').find({ id, branchId });
    const reservation = resRef.value();
    if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
    if (reservation.status !== 'confirmed') return res.status(409).json({ error: `Reservation already ${reservation.status}` });

    const finalTableId = tableId || reservation.tableId;
    if (!finalTableId) return res.status(400).json({ error: 'No table assigned — pick one to seat this reservation' });
    const table = db.get('tables').find({ id: finalTableId, branchId }).value();
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const waiter = autoAssignWaiter(branchId);
    db.get('tables').find({ id: finalTableId }).assign({
      status: 'occupied', assignedWaiterId: waiter ? waiter.id : null
    }).write();
    resRef.assign({ status: 'seated', tableId: finalTableId, seatedAt: new Date().toISOString() }).write();

    io.to(`branch:${branchId}`).emit('table:updated', db.get('tables').find({ id: finalTableId }).value());
    io.to(`branch:${branchId}`).emit('reservation:updated', resRef.value());
    res.json(resRef.value());
  });

  return router;
};
