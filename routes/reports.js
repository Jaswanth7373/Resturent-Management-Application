const express = require('express');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

module.exports = () => {
  const router = express.Router();

  router.get('/:branchId/summary', authRequired, requireRole('sub_admin', 'restaurant_admin', 'super_admin'), (req, res) => {
    const { branchId } = req.params;
    const orders = db.get('orders').filter({ branchId }).value().filter(o => o.status === 'completed');

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const sumSince = (d) => orders.filter(o => new Date(o.createdAt) >= d).reduce((s, o) => s + o.total, 0);
    const countSince = (d) => orders.filter(o => new Date(o.createdAt) >= d).length;

    const itemCounts = {};
    orders.forEach(o => o.items.forEach(i => {
      itemCounts[i.name] = (itemCounts[i.name] || 0) + i.qty;
    }));
    const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);

    res.json({
      revenue: {
        today: sumSince(startOfDay), week: sumSince(startOfWeek),
        month: sumSince(startOfMonth), year: sumSince(startOfYear), allTime: orders.reduce((s, o) => s + o.total, 0)
      },
      orderCounts: {
        today: countSince(startOfDay), week: countSince(startOfWeek),
        month: countSince(startOfMonth), year: countSince(startOfYear), allTime: orders.length
      },
      topItems: sorted.slice(0, 5).map(([name, qty]) => ({ name, qty })),
      leastItems: sorted.slice(-5).map(([name, qty]) => ({ name, qty })),
      cancelledCount: db.get('orders').filter({ branchId, status: 'cancelled' }).value().length,
      rejectedCount: db.get('orders').filter({ branchId, status: 'rejected' }).value().length,
    });
  });

  return router;
};
