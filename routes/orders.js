const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { autoAssignWaiter } = require('../lib/assignWaiter');
const { getAvailabilityStatus } = require('../lib/stock');

module.exports = (io) => {
  const router = express.Router();

  // If an order that reserved limited-quantity items is rejected/cancelled, give that stock back
  function restoreLimitedQuantities(order, branchId) {
    order.items.forEach(oi => {
      const mi = db.get('menuItems').find({ id: oi.menuItemId, branchId });
      const cur = mi.value();
      if (cur) {
        const restored = Math.max(0, Number(cur.availableQuantity || 0) + Number(oi.qty || 0));
        mi.assign({ availableQuantity: restored, availabilityStatus: getAvailabilityStatus(restored), limitedQuantity: restored, updatedAt: new Date().toISOString() }).write();
        io.to(`branch:${branchId}`).emit('menu:updated', { branchId });
      }
    });
  }

  // Create order: customer (self-serve, dine-in table select/auto-assign, take-away scheduled) or waiter (on behalf of table)
  router.post('/:branchId', (req, res) => {
    const { branchId } = req.params;
    const { mode, items, tableId, autoAssignTable, scheduledFor, customerName, notes, couponCode } = req.body;
    // items: [{ menuItemId, qty, specialInstructions }]

    if (!mode || !['dine_in', 'take_away'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be dine_in or take_away' });
    }
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }
    const branch = db.get('branches').find({ id: branchId }).value();
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    let assignedTable = null;
    if (mode === 'dine_in') {
      if (tableId) {
        assignedTable = db.get('tables').find({ id: tableId, branchId }).value();
        if (!assignedTable) return res.status(404).json({ error: 'Table not found' });
        if (assignedTable.status === 'occupied') return res.status(409).json({ error: 'Table is already occupied' });
      } else if (autoAssignTable) {
        assignedTable = db.get('tables').filter({ branchId, status: 'available' }).value()[0];
        if (!assignedTable) return res.status(409).json({ error: 'No tables currently available' });
      }
      if (assignedTable) {
        const waiter = autoAssignWaiter(branchId);
        db.get('tables').find({ id: assignedTable.id }).assign({
          status: 'occupied',
          assignedWaiterId: waiter ? waiter.id : (assignedTable.assignedWaiterId || null)
        }).write();
        io.to(`branch:${branchId}`).emit('table:updated', db.get('tables').find({ id: assignedTable.id }).value());
      }
    }

    let subtotal = 0;
    const orderItems = items.map(i => {
      const menuItem = db.get('menuItems').find({ id: i.menuItemId, branchId }).value();
      if (!menuItem) throw new Error('Invalid menu item');
      const stockQty = Number(menuItem.availableQuantity ?? menuItem.limitedQuantity ?? 0);
      if (stockQty < i.qty || menuItem.availabilityStatus === 'out_of_stock') {
        throw new Error(`Only ${stockQty} of "${menuItem.name}" left today`);
      }
      const lineTotal = menuItem.price * i.qty;
      subtotal += lineTotal;
      return {
        menuItemId: menuItem.id, name: menuItem.name, price: menuItem.price,
        qty: i.qty, specialInstructions: i.specialInstructions || '', lineTotal
      };
    });

    // Reserve stock so it can't be oversold while the order is pending
    orderItems.forEach(oi => {
      const mi = db.get('menuItems').find({ id: oi.menuItemId, branchId });
      const cur = mi.value();
      if (cur) {
        const nextQty = Math.max(0, Number(cur.availableQuantity ?? cur.limitedQuantity ?? 0) - Number(oi.qty || 0));
        const refreshed = { ...mi.value(), availableQuantity: nextQty, availabilityStatus: getAvailabilityStatus(nextQty), limitedQuantity: nextQty, updatedAt: new Date().toISOString() };
        mi.assign(refreshed).write();
        io.to(`branch:${branchId}`).emit('menu:updated', { branchId });
        if (refreshed.availabilityStatus === 'out_of_stock') {
          io.to(`branch:${branchId}`).emit('stock:out_of_stock', { branchId, item: refreshed });
        }
      }
    });

    // Real coupon lookup (this used to hardcode a single "WELCOME10" check and ignore
    // the coupons database entirely — any admin-created or edited coupon had zero effect).
    let discount = 0;
    let appliedCouponId = null;
    if (couponCode) {
      const coupon = db.get('coupons').find({ code: couponCode, restaurantId: branch.restaurantId, active: true }).value();
      if (!coupon) throw Object.assign(new Error('Invalid coupon code'), { status: 400 });
      if (new Date(coupon.validTill) < new Date()) throw Object.assign(new Error('Coupon has expired'), { status: 400 });
      if (coupon.usedCount >= coupon.maxUses) throw Object.assign(new Error('Coupon usage limit reached'), { status: 400 });
      if (coupon.minOrderValue && subtotal < coupon.minOrderValue) {
        throw Object.assign(new Error(`Minimum order value of ₹${coupon.minOrderValue} required for this coupon`), { status: 400 });
      }
      discount = coupon.discountType === 'percentage' ? Math.round(subtotal * coupon.discountValue / 100) : coupon.discountValue;
      appliedCouponId = coupon.id;
    }
    const tax = Math.round((subtotal - discount) * 0.05);
    const packingCharge = mode === 'take_away' ? 20 : 0;
    const total = subtotal - discount + tax + packingCharge;

    const order = {
      id: nanoid(),
      orderNumber: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
      branchId, mode,
      tableId: assignedTable ? assignedTable.id : null,
      customerName: customerName || 'Guest',
      items: orderItems,
      subtotal, discount, couponCode: appliedCouponId ? couponCode : null, tax, packingCharge, total,
      status: 'pending_acceptance', // pending_acceptance, accepted, preparing, ready, served, completed, rejected, cancelled
      paymentStatus: 'unpaid',
      paymentMethod: null,
      scheduledFor: mode === 'take_away' ? (scheduledFor || null) : null,
      notes: notes || '',
      createdAt: new Date().toISOString(),
      statusHistory: [{ status: 'pending_acceptance', at: new Date().toISOString() }]
    };
    db.get('orders').push(order).write();
    if (appliedCouponId) {
      const couponRef = db.get('coupons').find({ id: appliedCouponId });
      couponRef.assign({ usedCount: couponRef.value().usedCount + 1 }).write();
    }
    io.to(`branch:${branchId}`).emit('order:new', order);
    io.to(`branch:${branchId}`).emit('order:created', order);
    res.status(201).json(order);
  });

  router.get('/:branchId', (req, res) => {
    const { branchId } = req.params;
    const { status, tableId } = req.query;
    let orders = db.get('orders').filter({ branchId }).value();
    if (status) orders = orders.filter(o => o.status === status);
    if (tableId) orders = orders.filter(o => o.tableId === tableId);
    orders = orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
  });

  router.get('/:branchId/:orderId', (req, res) => {
    const order = db.get('orders').find({ id: req.params.orderId, branchId: req.params.branchId }).value();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  });

  // Waiter: add item to an existing order (customer at table requests more)
  router.post('/:branchId/:orderId/items', authRequired, requireRole('waiter'), (req, res) => {
    const { branchId, orderId } = req.params;
    const { menuItemId, qty, specialInstructions } = req.body;
    const menuItem = db.get('menuItems').find({ id: menuItemId, branchId }).value();
    if (!menuItem) return res.status(404).json({ error: 'Menu item not found' });
    const orderRef = db.get('orders').find({ id: orderId, branchId });
    const order = orderRef.value();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const lineTotal = menuItem.price * qty;
    order.items.push({ menuItemId, name: menuItem.name, price: menuItem.price, qty, specialInstructions: specialInstructions || '', lineTotal });
    order.subtotal += lineTotal;
    order.tax = Math.round((order.subtotal - order.discount) * 0.05);
    order.total = order.subtotal - order.discount + order.tax + order.packingCharge;
    orderRef.assign(order).write();
    io.to(`branch:${branchId}`).emit('order:updated', order);
    res.json(order);
  });

  // Waiter: remove an item from an existing order (by menuItemId)
  router.delete('/:branchId/:orderId/items/:menuItemId', authRequired, requireRole('waiter'), (req, res) => {
    const { branchId, orderId, menuItemId } = req.params;
    const orderRef = db.get('orders').find({ id: orderId, branchId });
    const order = orderRef.value();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const idx = order.items.findIndex(oi => oi.menuItemId === menuItemId);
    if (idx === -1) return res.status(404).json({ error: 'Item not found in order' });

    const removed = order.items.splice(idx, 1)[0];
    order.subtotal = Math.max(0, order.subtotal - (removed.lineTotal || (removed.price * removed.qty)));
    order.tax = Math.round((order.subtotal - order.discount) * 0.05);
    order.total = order.subtotal - order.discount + order.tax + order.packingCharge;
    orderRef.assign(order).write();
    io.to(`branch:${branchId}`).emit('order:updated', order);
    res.json(order);
  });

  // Chef: accept or reject
  router.patch('/:branchId/:orderId/accept', authRequired, requireRole('chef'), (req, res) => {
    const { branchId, orderId } = req.params;
    const orderRef = db.get('orders').find({ id: orderId, branchId });
    const order = orderRef.value();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending_acceptance') return res.status(409).json({ error: 'Order already actioned' });

    // Auto-deduct inventory per recipe
    order.items.forEach(oi => {
      const menuItem = db.get('menuItems').find({ id: oi.menuItemId }).value();
      if (menuItem && menuItem.recipe) {
        menuItem.recipe.forEach(r => {
          const ing = db.get('ingredients').find({ id: r.ingredientId });
          const cur = ing.value();
          if (cur) {
            const newStock = Math.max(0, cur.stock - r.qty * oi.qty);
            ing.assign({ stock: newStock }).write();
            if (newStock <= cur.lowStockThreshold) {
              io.to(`branch:${branchId}`).emit('inventory:low_stock', { ingredient: cur.name, stock: newStock });
            }
          }
        });
      }
    });

    order.status = 'accepted';
    order.items.forEach(oi => {
      const menuItem = db.get('menuItems').find({ id: oi.menuItemId, branchId }).value();
      if (menuItem) {
        const nextQty = Math.max(0, Number(menuItem.availableQuantity ?? menuItem.limitedQuantity ?? 0) - Number(oi.qty || 0));
        db.get('menuItems').find({ id: oi.menuItemId, branchId }).assign({ availableQuantity: nextQty, availabilityStatus: getAvailabilityStatus(nextQty), limitedQuantity: nextQty, updatedAt: new Date().toISOString() }).write();
      }
    });
    order.statusHistory.push({ status: 'accepted', at: new Date().toISOString() });
    orderRef.assign(order).write();
    io.to(`branch:${branchId}`).emit('order:updated', order);
    res.json(order);
  });

  router.patch('/:branchId/:orderId/reject', authRequired, requireRole('chef'), (req, res) => {
    const { branchId, orderId } = req.params;
    const { reason } = req.body;
    const orderRef = db.get('orders').find({ id: orderId, branchId });
    const order = orderRef.value();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.status = 'rejected';
    order.rejectionReason = reason || 'Item out of stock';
    order.statusHistory.push({ status: 'rejected', at: new Date().toISOString() });
    orderRef.assign(order).write();
    restoreLimitedQuantities(order, branchId);
    if (order.tableId) {
      db.get('tables').find({ id: order.tableId }).assign({ status: 'available' }).write();
      io.to(`branch:${branchId}`).emit('table:updated', db.get('tables').find({ id: order.tableId }).value());
    }
    io.to(`branch:${branchId}`).emit('order:updated', order);
    res.json(order);
  });

  // General status update (preparing, ready, served, completed) - chef or waiter
  router.patch('/:branchId/:orderId/status', authRequired, requireRole('chef', 'waiter'), (req, res) => {
    const { branchId, orderId } = req.params;
    const { status } = req.body;
    const allowed = ['preparing', 'ready', 'served', 'completed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
    const orderRef = db.get('orders').find({ id: orderId, branchId });
    const order = orderRef.value();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Chef owns the kitchen steps; front-of-house (waiter) owns hand-off to the guest.
    if (['preparing', 'ready'].includes(status) && req.user.role !== 'chef') {
      return res.status(403).json({ error: 'Only the kitchen can move an order to preparing/ready' });
    }
    if (['served', 'completed'].includes(status) && req.user.role !== 'waiter') {
      return res.status(403).json({ error: 'Only front-of-house can mark an order served/completed' });
    }
    // "Served" means food delivered to a table — take-away has no table, it goes straight ready -> completed (picked up)
    if (status === 'served' && order.mode === 'take_away') {
      return res.status(400).json({ error: 'Take-away orders skip "served" — mark them "completed" once the guest picks it up' });
    }

    order.status = status;
    order.statusHistory.push({ status, at: new Date().toISOString() });
    orderRef.assign(order).write();

    if (status === 'completed' && order.tableId) {
      db.get('tables').find({ id: order.tableId }).assign({ status: 'cleaning' }).write();
      io.to(`branch:${branchId}`).emit('table:updated', db.get('tables').find({ id: order.tableId }).value());
    }
    if (status === 'completed') {
      order.items.forEach(oi => {
        const menuItem = db.get('menuItems').find({ id: oi.menuItemId, branchId }).value();
        if (menuItem) {
          const nextQty = Math.max(0, Number(menuItem.availableQuantity ?? menuItem.limitedQuantity ?? 0) - Number(oi.qty || 0));
          const updatedItem = db.get('menuItems').find({ id: oi.menuItemId, branchId }).value();
          const refreshed = { ...updatedItem, availableQuantity: nextQty, availabilityStatus: getAvailabilityStatus(nextQty), limitedQuantity: nextQty, updatedAt: new Date().toISOString() };
          db.get('menuItems').find({ id: oi.menuItemId, branchId }).assign(refreshed).write();
          if (refreshed.availabilityStatus === 'out_of_stock') {
            io.to(`branch:${branchId}`).emit('stock:out_of_stock', { branchId, item: refreshed });
          }
        }
      });
      io.to(`branch:${branchId}`).emit('stock:updated', { branchId });
    }
    io.to(`branch:${branchId}`).emit('order:updated', order);
    res.json(order);
  });

  // Cancel - only allowed before chef accepts
  router.patch('/:branchId/:orderId/cancel', (req, res) => {
    const { branchId, orderId } = req.params;
    const orderRef = db.get('orders').find({ id: orderId, branchId });
    const order = orderRef.value();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending_acceptance') {
      return res.status(409).json({ error: 'Order can only be cancelled before the kitchen accepts it' });
    }
    order.status = 'cancelled';
    order.statusHistory.push({ status: 'cancelled', at: new Date().toISOString() });
    restoreLimitedQuantities(order, branchId);
    // Pre-accept cancellation policy: any payment already captured is fully refunded
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'partial') {
      order.refund = {
        amount: order.total,
        reason: 'pre-accept cancellation',
        at: new Date().toISOString()
      };
      order.paymentStatus = 'refunded';
    }
    orderRef.assign(order).write();
    if (order.tableId) {
      db.get('tables').find({ id: order.tableId }).assign({ status: 'available' }).write();
      io.to(`branch:${branchId}`).emit('table:updated', db.get('tables').find({ id: order.tableId }).value());
    }
    io.to(`branch:${branchId}`).emit('order:updated', order);
    res.json(order);
  });

  // Payment - supports a single full payment or a series of split-bill partial payments.
  // Body: { method: 'cash'|'upi'|'card', amount?: number, payerLabel?: string }
  // Omitting `amount` pays the remaining balance in full (original single-payment behaviour).
  router.patch('/:branchId/:orderId/pay', (req, res) => {
    const { branchId, orderId } = req.params;
    const { method, amount, payerLabel } = req.body;
    const orderRef = db.get('orders').find({ id: orderId, branchId });
    const order = orderRef.value();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!order.payments) order.payments = [];
    const alreadyPaid = order.payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, order.total - alreadyPaid);
    const thisAmount = (amount === undefined || amount === null) ? remaining : Math.min(Number(amount), remaining);

    if (thisAmount <= 0) return res.status(409).json({ error: 'Order is already fully paid' });

    order.payments.push({
      amount: thisAmount,
      method: method || 'cash',
      payerLabel: payerLabel || null,
      at: new Date().toISOString()
    });

    const nowPaid = alreadyPaid + thisAmount;
    order.paymentMethod = method || 'cash';
    order.paymentStatus = nowPaid >= order.total ? 'paid' : 'partial';
    orderRef.assign(order).write();
    io.to(`branch:${branchId}`).emit('order:updated', order);
    res.json(order);
  });

  // Split-bill helper: compute an equal N-way split of the remaining balance (no state change)
  router.get('/:branchId/:orderId/split/:parts', (req, res) => {
    const { branchId, orderId, parts } = req.params;
    const n = Math.max(1, parseInt(parts, 10) || 1);
    const order = db.get('orders').find({ id: orderId, branchId }).value();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const alreadyPaid = (order.payments || []).reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, order.total - alreadyPaid);
    const share = Math.floor((remaining / n) * 100) / 100;
    const shares = Array.from({ length: n }, (_, i) => (i === n - 1 ? Math.round((remaining - share * (n - 1)) * 100) / 100 : share));
    res.json({ total: order.total, alreadyPaid, remaining, parts: n, shares });
  });

  return router;
};
