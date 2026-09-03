const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

module.exports = () => {
  const router = express.Router();

  // Get all branches for a restaurant
  router.get('/restaurant/:restaurantId', authRequired, (req, res) => {
    const branches = db.get('branches')
      .filter({ restaurantId: req.params.restaurantId })
      .value()
      .map(b => ({
        ...b,
        tables: db.get('tables').filter({ branchId: b.id }).value().length,
        staff: db.get('users').filter({ branchId: b.id }).value().length
      }));

    res.json(branches);
  });

  // Get branch details
  router.get('/:id', authRequired, (req, res) => {
    const branch = db.get('branches').find({ id: req.params.id }).value();

    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    res.json({
      ...branch,
      tables: db.get('tables').filter({ branchId: req.params.id }).value(),
      staff: db.get('users').filter({ branchId: req.params.id }).value(),
      operatingHours: branch.operatingHours || { open: '10:00', close: '23:00' }
    });
  });

  // Create branch (restaurant admin only)
  router.post('/', authRequired, requireRole('restaurant_admin', 'super_admin'), (req, res) => {
    const { restaurantId, name, address, city, phone, email, tableCount, operatingHours } = req.body;

    const branch = {
      id: nanoid(),
      restaurantId,
      name,
      address,
      city,
      phone,
      email,
      operatingHours: operatingHours || null,
      createdAt: new Date().toISOString()
    };

    db.get('branches').push(branch).write();

    // Starter tables so the branch is immediately usable, sized simply from the requested count
    const seatPattern = [2, 2, 4, 4, 6, 8];
    const count = Math.max(0, Math.min(30, Number(tableCount) || 0));
    for (let idx = 0; idx < count; idx++) {
      db.get('tables').push({
        id: nanoid(),
        branchId: branch.id,
        number: idx + 1,
        seats: seatPattern[idx % seatPattern.length],
        status: 'available',
        assignedWaiterId: null,
        qrCode: `TABLE-${branch.id}-${idx + 1}`
      }).write();
    }

    res.status(201).json({ ...branch, tablesCreated: count });
  });

  // Update branch
  router.patch('/:id', authRequired, requireRole('restaurant_admin', 'sub_admin'), (req, res) => {
    const branch = db.get('branches').find({ id: req.params.id }).value();

    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    const updated = { ...branch, ...req.body, id: branch.id };
    db.get('branches').find({ id: req.params.id }).assign(updated).write();
    res.json(updated);
  });

  // Get operating hours
  router.get('/:id/operating-hours', (req, res) => {
    const branch = db.get('branches').find({ id: req.params.id }).value();

    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    res.json(branch.operatingHours || {
      monday: { open: '10:00', close: '23:00' },
      tuesday: { open: '10:00', close: '23:00' },
      wednesday: { open: '10:00', close: '23:00' },
      thursday: { open: '10:00', close: '23:00' },
      friday: { open: '10:00', close: '23:00' },
      saturday: { open: '09:00', close: '00:00' },
      sunday: { open: '09:00', close: '23:00' }
    });
  });

  // Update operating hours
  router.patch('/:id/operating-hours', authRequired, requireRole('restaurant_admin', 'sub_admin'), (req, res) => {
    const branch = db.get('branches').find({ id: req.params.id }).value();

    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    const updated = { ...branch, operatingHours: req.body };
    db.get('branches').find({ id: req.params.id }).assign(updated).write();
    res.json(updated);
  });

  return router;
};
