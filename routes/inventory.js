const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

module.exports = (io) => {
  const router = express.Router();

  // Current stock levels, with a suggested reorder qty for anything at/below threshold
  router.get('/:branchId', authRequired, requireRole('inventory_manager', 'sub_admin', 'restaurant_admin', 'chef', 'super_admin'), (req, res) => {
    const ingredients = db.get('ingredients').filter({ branchId: req.params.branchId }).value().map(i => ({
      ...i,
      lowStock: i.stock <= i.lowStockThreshold,
      suggestedReorderQty: i.stock <= i.lowStockThreshold ? Math.max(0, i.lowStockThreshold * 3 - i.stock) : 0
    }));
    res.json(ingredients);
  });

  // Chef's own read on how much of an ingredient is on hand right now (Heavy/Medium/Low) —
  // a fast, subjective supplement to the numeric count, visible to Sub-Admin and Inventory Manager
  router.patch('/:branchId/:ingredientId/chef-rating', authRequired, requireRole('chef'), (req, res) => {
    const { branchId, ingredientId } = req.params;
    const { level } = req.body; // 'heavy' | 'medium' | 'low'
    if (!['heavy', 'medium', 'low'].includes(level)) return res.status(400).json({ error: 'level must be heavy, medium, or low' });
    const ing = db.get('ingredients').find({ id: ingredientId, branchId });
    if (!ing.value()) return res.status(404).json({ error: 'Ingredient not found' });
    ing.assign({ chefStockLevel: level, chefStockLevelBy: req.user.name, chefStockLevelAt: new Date().toISOString() }).write();
    io.to(`branch:${branchId}`).emit('inventory:updated', ing.value());
    res.json(ing.value());
  });

  // Generic ingredient field edit (currently used for assigning a preferred supplier and
  // adjusting the low-stock threshold from the detail panel)
  router.patch('/:branchId/:ingredientId', authRequired, requireRole('inventory_manager', 'sub_admin', 'restaurant_admin'), (req, res) => {
    const { branchId, ingredientId } = req.params;
    const { preferredSupplierId, lowStockThreshold } = req.body;
    const ing = db.get('ingredients').find({ id: ingredientId, branchId });
    if (!ing.value()) return res.status(404).json({ error: 'Ingredient not found' });
    const updates = {};
    if (preferredSupplierId !== undefined) updates.preferredSupplierId = preferredSupplierId || null;
    if (lowStockThreshold !== undefined) updates.lowStockThreshold = Number(lowStockThreshold);
    ing.assign(updates).write();
    io.to(`branch:${branchId}`).emit('inventory:updated', ing.value());
    res.json(ing.value());
  });

  // Log a reorder request to a supplier. There's no real email/SMS integration in this build
  // (see BACKLOG.md) — this creates an internal purchase-order record that Sub-Admin/Inventory
  // Manager can track, which is the honest scope of what "send to supplier" means here.
  router.post('/:branchId/:ingredientId/send-to-supplier', authRequired, requireRole('inventory_manager', 'sub_admin', 'restaurant_admin'), (req, res) => {
    const { branchId, ingredientId } = req.params;
    const { supplierId, qty } = req.body;
    const ing = db.get('ingredients').find({ id: ingredientId, branchId }).value();
    if (!ing) return res.status(404).json({ error: 'Ingredient not found' });
    const supplier = db.get('suppliers').find({ id: supplierId, branchId }).value();
    if (!supplier) return res.status(400).json({ error: 'Pick a valid supplier for this branch' });
    const orderQty = Number(qty) || ing.lowStockThreshold * 2;

    const po = {
      id: nanoid(), branchId, ingredientId, ingredientName: ing.name, supplierId, supplierName: supplier.name,
      qty: orderQty, unit: ing.unit, status: 'sent', sentBy: req.user.name, sentAt: new Date().toISOString()
    };
    db.get('purchaseOrders').push(po).write();
    io.to(`branch:${branchId}`).emit('inventory:po_sent', po);
    res.status(201).json(po);
  });

  // Purchase orders sent to suppliers, optionally filtered to one ingredient
  router.get('/:branchId/purchase-orders', authRequired, requireRole('inventory_manager', 'sub_admin', 'restaurant_admin', 'super_admin'), (req, res) => {
    const { branchId } = req.params;
    const { ingredientId } = req.query;
    let pos = db.get('purchaseOrders').filter({ branchId }).value();
    if (ingredientId) pos = pos.filter(p => p.ingredientId === ingredientId);
    res.json(pos.slice().sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt)));
  });

  // Suppliers
  router.get('/:branchId/suppliers', authRequired, requireRole('inventory_manager', 'sub_admin', 'restaurant_admin', 'super_admin'), (req, res) => {
    res.json(db.get('suppliers').filter({ branchId: req.params.branchId }).value());
  });

  router.post('/:branchId/suppliers', authRequired, requireRole('inventory_manager', 'restaurant_admin'), (req, res) => {
    const { branchId } = req.params;
    const { name, category, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Supplier name is required' });
    const supplier = { id: nanoid(), branchId, name, category: category || '', phone: phone || '', email: email || '', createdAt: new Date().toISOString() };
    db.get('suppliers').push(supplier).write();
    res.status(201).json(supplier);
  });

  // Stock ledger (in / out), newest first, optionally filtered by ingredient
  router.get('/:branchId/transactions', authRequired, requireRole('inventory_manager', 'sub_admin', 'restaurant_admin', 'super_admin'), (req, res) => {
    const { branchId } = req.params;
    const { ingredientId } = req.query;
    let txns = db.get('stockTransactions').filter({ branchId }).value();
    if (ingredientId) txns = txns.filter(t => t.ingredientId === ingredientId);
    txns = txns.slice().sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json(txns);
  });

  // Stock IN — a delivery/purchase received from a supplier, with batch + expiry tracking
  router.post('/:branchId/:ingredientId/stock-in', authRequired, requireRole('inventory_manager', 'restaurant_admin'), (req, res) => {
    const { branchId, ingredientId } = req.params;
    const { amount, supplierId, batchNumber, expiryDate } = req.body;
    const qty = Number(amount);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
    const ing = db.get('ingredients').find({ id: ingredientId, branchId });
    const current = ing.value();
    if (!current) return res.status(404).json({ error: 'Ingredient not found' });

    ing.assign({ stock: current.stock + qty }).write();

    const txn = {
      id: nanoid(), branchId, ingredientId, type: 'in', qty,
      supplierId: supplierId || null, batchNumber: batchNumber || null, expiryDate: expiryDate || null,
      recordedBy: req.user.name, at: new Date().toISOString()
    };
    db.get('stockTransactions').push(txn).write();
    io.to(`branch:${branchId}`).emit('inventory:updated', ing.value());
    res.status(201).json({ ingredient: ing.value(), transaction: txn });
  });

  // Stock OUT — manual deduction: waste, spoilage, correction (recipe auto-deduction on order-accept is separate)
  router.post('/:branchId/:ingredientId/stock-out', authRequired, requireRole('inventory_manager', 'chef', 'restaurant_admin'), (req, res) => {
    const { branchId, ingredientId } = req.params;
    const { amount, reason } = req.body;
    const qty = Number(amount);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
    const ing = db.get('ingredients').find({ id: ingredientId, branchId });
    const current = ing.value();
    if (!current) return res.status(404).json({ error: 'Ingredient not found' });

    const newStock = Math.max(0, current.stock - qty);
    ing.assign({ stock: newStock }).write();

    const txn = {
      id: nanoid(), branchId, ingredientId, type: 'out', qty,
      reason: reason || 'waste', recordedBy: req.user.name, at: new Date().toISOString()
    };
    db.get('stockTransactions').push(txn).write();
    io.to(`branch:${branchId}`).emit('inventory:updated', ing.value());
    if (newStock <= current.lowStockThreshold) {
      io.to(`branch:${branchId}`).emit('inventory:low_stock', { ingredient: current.name, stock: newStock });
    }
    res.status(201).json({ ingredient: ing.value(), transaction: txn });
  });

  // Kept for backward compatibility (Sub-Admin's quick "Restock" button) — logs a proper stock-in transaction too
  router.patch('/:branchId/:ingredientId/restock', authRequired, requireRole('inventory_manager', 'restaurant_admin'), (req, res) => {
    const { branchId, ingredientId } = req.params;
    const { amount, supplier, batchNumber } = req.body;
    const qty = Number(amount || 0);
    const ing = db.get('ingredients').find({ id: ingredientId, branchId });
    const current = ing.value();
    if (!current) return res.status(404).json({ error: 'Ingredient not found' });
    const newStock = current.stock + qty;
    ing.assign({ stock: newStock, lastRestockedBy: supplier || null, lastBatch: batchNumber || null }).write();
    if (qty > 0) {
      db.get('stockTransactions').push({
        id: nanoid(), branchId, ingredientId, type: 'in', qty,
        supplierId: null, batchNumber: batchNumber || null, expiryDate: null,
        recordedBy: req.user.name, at: new Date().toISOString()
      }).write();
    }
    io.to(`branch:${branchId}`).emit('inventory:updated', ing.value());
    res.json(ing.value());
  });

  return router;
};
