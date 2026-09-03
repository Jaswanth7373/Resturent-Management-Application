const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { applyAvailabilityToItem, getAvailabilityStatus } = require('../lib/stock');

// Time-of-day windows a menu item can be scoped to (used by the Sub-Admin's
// "Only Breakfast / Lunch / Dinner / Happy Hour" control and enforced live
// on the customer-facing menu — no manual refresh needed, since the menu
// re-fetches on every visit and on every `menu:updated` socket event).
const WINDOWS = {
  all_day: null,
  breakfast: { start: '06:00', end: '11:00' },
  lunch: { start: '12:00', end: '16:00' },
  dinner: { start: '18:00', end: '23:00' },
  happy_hour: { start: '17:00', end: '19:00' },
};
function isWithinWindow(key) {
  const w = WINDOWS[key];
  if (!w) return true; // all_day, festival, or unrecognized -> always available
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  return hhmm >= w.start && hhmm <= w.end;
}

module.exports = (io) => {
  const router = express.Router();

  function emitMenuUpdate(branchId) {
    io.to(`branch:${branchId}`).emit('menu:updated', { branchId });
  }

  function normalizeMenuItem(item) {
    if (!item) return item;
    return applyAvailabilityToItem(item);
  }

  function getBranchMenu(branchId, { visibleOnly = false } = {}) {
    let items = db.get('menuItems').filter({ branchId }).value().map(normalizeMenuItem);
    if (visibleOnly) {
      items = items.filter(i => i.status === 'live')
        .filter(i => isWithinWindow(i.availabilityWindow || 'all_day'));
    }
    return items;
  }

  // Public-ish: get full menu for a branch (customers, waiters, kitchen all use this)
  router.get('/:branchId', (req, res) => {
    const { branchId } = req.params;
    const { visibleOnly } = req.query;
    const items = getBranchMenu(branchId, { visibleOnly: visibleOnly === 'true' });
    const categories = db.get('menuCategories').filter({ branchId }).value();
    res.json({ categories, items });
  });

  // Chef submits a new item -> goes to pending_approval
  router.post('/:branchId/items', authRequired, requireRole('chef', 'restaurant_admin', 'sub_admin', 'super_admin'), (req, res) => {
    const { branchId } = req.params;
    const { name, description, price, veg, mode, categoryId, prepTime, availabilityWindow, seasonal, limitedQuantity } = req.body;
    if (!name || !price || !categoryId) return res.status(400).json({ error: 'name, price, categoryId are required' });

    const status = req.user.role === 'chef' ? 'pending_approval' : 'live';
    const initialQuantity = (limitedQuantity === undefined || limitedQuantity === null || limitedQuantity === '') ? 15 : Number(limitedQuantity);
    const item = {
      id: nanoid(), branchId, categoryId, name, description: description || '',
      price: Number(price), veg: !!veg, mode: mode || 'both', status,
      prepTime: prepTime || 15, recipe: [], submittedBy: req.user.role, rating: null,
      availabilityWindow: availabilityWindow || 'all_day',
      seasonal: !!seasonal,
      limitedQuantity: initialQuantity,
      availableQuantity: initialQuantity,
      availabilityStatus: getAvailabilityStatus(initialQuantity),
      updatedBy: req.user?.id || null,
      updatedAt: new Date().toISOString(),
      stockScheduledUntil: null
    };
    db.get('menuItems').push(item).write();
    emitMenuUpdate(branchId);
    res.status(201).json(normalizeMenuItem(item));
  });

  // Create a new menu category
  router.post('/:branchId/categories', authRequired, requireRole('sub_admin', 'restaurant_admin', 'super_admin'), (req, res) => {
    const { branchId } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required' });
    if (db.get('menuCategories').find({ branchId, name: name.trim() }).value()) {
      return res.status(409).json({ error: 'A category with this name already exists' });
    }
    const category = { id: nanoid(), branchId, name: name.trim() };
    db.get('menuCategories').push(category).write();
    io.to(`branch:${branchId}`).emit('menu:updated', { branchId });
    res.status(201).json(category);
  });

  // Sub-admin / restaurant admin / super admin: approve, hide, change mode/price/status
  router.patch('/:branchId/items/:itemId', authRequired, requireRole('sub_admin', 'restaurant_admin', 'super_admin'), (req, res) => {
    const { branchId, itemId } = req.params;
    const updates = req.body; // { status, mode, price, veg, hidden... }
    const item = db.get('menuItems').find({ id: itemId, branchId });
    if (!item.value()) return res.status(404).json({ error: 'Item not found' });
    const current = item.value();
    const next = { ...current, ...updates, updatedBy: req.user?.id || current.updatedBy, updatedAt: new Date().toISOString() };
    if (updates.availableQuantity !== undefined) {
      next.availableQuantity = Math.max(0, Number(updates.availableQuantity));
      next.availabilityStatus = getAvailabilityStatus(next.availableQuantity);
      next.limitedQuantity = next.availableQuantity;
    }
    if (updates.stockScheduledUntil !== undefined && updates.stockScheduledUntil !== null) {
      next.stockScheduledUntil = updates.stockScheduledUntil;
      if (new Date(updates.stockScheduledUntil) > new Date()) {
        next.availabilityStatus = 'out_of_stock';
      }
    }
    item.assign(next).write();
    emitMenuUpdate(branchId);
    res.json(normalizeMenuItem(item.value()));
  });

  router.patch('/:branchId/items/:itemId/stock', authRequired, requireRole('chef'), (req, res) => {
    const { branchId, itemId } = req.params;
    const { availableQuantity, stockScheduledUntil } = req.body || {};
    const itemRef = db.get('menuItems').find({ id: itemId, branchId });
    const current = itemRef.value();
    if (!current) return res.status(404).json({ error: 'Item not found' });
    if (req.user.role === 'customer') return res.status(403).json({ error: 'Customers cannot modify stock' });
    const nextQuantity = availableQuantity === undefined ? current.availableQuantity : Math.max(0, Number(availableQuantity));
    const next = {
      ...current,
      availableQuantity: nextQuantity,
      availabilityStatus: getAvailabilityStatus(nextQuantity),
      limitedQuantity: nextQuantity,
      updatedBy: req.user?.id || current.updatedBy,
      updatedAt: new Date().toISOString(),
      ...(stockScheduledUntil !== undefined ? { stockScheduledUntil } : {})
    };
    if (stockScheduledUntil !== undefined && stockScheduledUntil) {
      next.availabilityStatus = 'out_of_stock';
    }
    itemRef.assign(next).write();
    const refreshed = normalizeMenuItem(itemRef.value());
    emitMenuUpdate(branchId);
    io.to(`branch:${branchId}`).emit('stock:updated', refreshed);
    if (refreshed.availabilityStatus === 'out_of_stock') {
      io.to(`branch:${branchId}`).emit('stock:out_of_stock', { branchId, item: refreshed });
    }
    res.json(refreshed);
  });

  router.delete('/:branchId/items/:itemId', authRequired, requireRole('sub_admin', 'restaurant_admin', 'super_admin'), (req, res) => {
    const { branchId, itemId } = req.params;
    db.get('menuItems').remove({ id: itemId, branchId }).write();
    emitMenuUpdate(branchId);
    res.json({ success: true });
  });

  return router;
};
