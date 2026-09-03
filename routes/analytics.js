const express = require('express');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

module.exports = () => {
  const router = express.Router();

  // Restaurant admin: Get detailed analytics
  router.get('/restaurant/:branchId', authRequired, requireRole('restaurant_admin', 'sub_admin'), (req, res) => {
    const branchId = req.params.branchId;
    const orders = db.get('orders').filter({ branchId }).value();
    const items = db.get('menuItems').filter({ branchId }).value();

    // Calculate trends
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentOrders = orders.filter(o => new Date(o.createdAt) > last7Days);
    const monthlyOrders = orders.filter(o => new Date(o.createdAt) > last30Days);

    // Peak hours
    const hourCounts = {};
    recentOrders.forEach(o => {
      const hour = new Date(o.createdAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

    // Day-of-week analysis
    const dayCounts = {};
    monthlyOrders.forEach(o => {
      const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(o.createdAt).getDay()];
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });

    res.json({
      ordersLast7Days: recentOrders.length,
      ordersLast30Days: monthlyOrders.length,
      avgOrderValueLast7Days: recentOrders.length > 0 ? (recentOrders.reduce((s,o) => s + o.total, 0) / recentOrders.length).toFixed(2) : 0,
      peakHour: peakHour ? `${peakHour[0]}:00 (${peakHour[1]} orders)` : 'N/A',
      ordersByDay: dayCounts,
      totalItems: items.length,
      activeItems: items.filter(i => i.status === 'live').length,
      itemsLowRating: items.filter(i => i.rating < 3.5),
      conversionRate: orders.filter(o => o.status === 'completed').length / (orders.length || 1)
    });
  });

  // Customer spending analysis
  router.get('/customer/:userId', authRequired, (req, res) => {
    const userId = req.params.userId;
    const orders = db.get('orders').filter({ customerId: userId }).value();

    if (orders.length === 0) {
      return res.json({ totalSpent: 0, orderCount: 0, avgOrderValue: 0, favoriteRestaurant: null });
    }

    const totalSpent = orders.reduce((s, o) => s + o.total, 0);
    const avgOrderValue = (totalSpent / orders.length).toFixed(2);

    // Find favorite restaurant
    const restaurantCounts = {};
    orders.forEach(o => {
      restaurantCounts[o.restaurantId] = (restaurantCounts[o.restaurantId] || 0) + 1;
    });
    const favoriteRestaurantId = Object.entries(restaurantCounts).sort((a, b) => b[1] - a[1])[0][0];
    const favoriteRestaurant = db.get('restaurants').find({ id: favoriteRestaurantId }).value();

    res.json({
      totalSpent: totalSpent.toFixed(2),
      orderCount: orders.length,
      avgOrderValue,
      favoriteRestaurant: favoriteRestaurant?.name,
      lastOrderDate: orders[orders.length - 1].createdAt
    });
  });

  // Item performance
  router.get('/items/:branchId', authRequired, (req, res) => {
    const branchId = req.params.branchId;
    const items = db.get('menuItems').filter({ branchId }).value();
    const orders = db.get('orders').filter({ branchId }).value();

    const itemPerformance = items.map(item => {
      const itemOrders = orders.filter(o => 
        o.items && o.items.some(oi => oi.menuItemId === item.id)
      );
      const totalQty = itemOrders.reduce((sum, o) => 
        sum + (o.items.find(oi => oi.menuItemId === item.id)?.qty || 0), 0
      );
      const revenue = itemOrders.reduce((sum, o) => 
        sum + ((o.items.find(oi => oi.menuItemId === item.id)?.lineTotal) || 0), 0
      );

      return {
        id: item.id,
        name: item.name,
        price: item.price,
        rating: item.rating,
        totalQtySold: totalQty,
        totalRevenue: revenue.toFixed(2),
        orderCount: itemOrders.length,
        status: item.status
      };
    }).sort((a, b) => b.totalQtySold - a.totalQtySold);

    res.json(itemPerformance);
  });

  // Delivery & pickup performance
  router.get('/fulfillment/:branchId', authRequired, (req, res) => {
    const branchId = req.params.branchId;
    const orders = db.get('orders').filter({ branchId }).value();

    const dineInOrders = orders.filter(o => o.mode === 'dine_in');
    const takeAwayOrders = orders.filter(o => o.mode === 'take_away');

    const avgDineInTime = dineInOrders.length > 0 ? 
      Math.round(dineInOrders.reduce((s, o) => s + (new Date(o.completedAt || Date.now()) - new Date(o.createdAt)) / 60000, 0) / dineInOrders.length) : 0;

    const avgTakeAwayTime = takeAwayOrders.length > 0 ?
      Math.round(takeAwayOrders.reduce((s, o) => s + (new Date(o.completedAt || Date.now()) - new Date(o.createdAt)) / 60000, 0) / takeAwayOrders.length) : 0;

    res.json({
      dineInOrders: dineInOrders.length,
      takeAwayOrders: takeAwayOrders.length,
      avgDineInTimeMinutes: avgDineInTime,
      avgTakeAwayTimeMinutes: avgTakeAwayTime,
      dineInRevenue: dineInOrders.reduce((s, o) => s + o.total, 0).toFixed(2),
      takeAwayRevenue: takeAwayOrders.reduce((s, o) => s + o.total, 0).toFixed(2)
    });
  });

  return router;
};
