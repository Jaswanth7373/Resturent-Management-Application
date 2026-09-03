const express = require('express');
const { nanoid } = require('nanoid');
const { db, hash } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function defaultOperatingHours() {
  const hours = {};
  DAYS.forEach(d => { hours[d] = { open: '10:00', close: '23:00', closed: false }; });
  return hours;
}

module.exports = (io) => {
  const router = express.Router();

  // Creates restaurant + a starter branch/tables/categories + the restaurant_admin login.
  // Shared by both the direct "Add restaurant" form and approving a self-registration request.
  // New admin accounts all use the platform's shared demo password ("password"), same as every
  // other seeded account — there's no real invite/reset-email flow in this build (see BACKLOG.md).
  function provisionRestaurant(details) {
    const { name, cuisine, description, address, city, type, phone, operatingHours, adminName, adminEmail } = details;
    if (!name || !adminName || !adminEmail) {
      const err = new Error('Restaurant name, admin name, and admin email are required');
      err.status = 400; throw err;
    }
    if (db.get('users').find({ email: adminEmail }).value()) {
      const err = new Error(`An account with email ${adminEmail} already exists`);
      err.status = 409; throw err;
    }

    const restaurantId = nanoid();
    const branchId = nanoid();

    const restaurant = {
      id: restaurantId, name, cuisine: cuisine || type || 'Multi-Cuisine', type: type || cuisine || 'Restaurant',
      description: description || '', tags: [], rating: null, priceRange: '₹₹',
      operatingHours: operatingHours && Object.keys(operatingHours).length ? operatingHours : defaultOperatingHours(),
      status: 'active', createdAt: new Date().toISOString()
    };
    db.get('restaurants').push(restaurant).write();

    const branch = { id: branchId, restaurantId, name: 'Main Branch', address: address || '', city: city || '', phone: phone || '' };
    db.get('branches').push(branch).write();

    // A handful of starter tables so the branch is immediately usable — the admin can rename/adjust later.
    [2, 2, 4, 4, 6, 8].forEach((seats, idx) => {
      db.get('tables').push({
        id: nanoid(), branchId, number: idx + 1, seats, status: 'available', qrCode: `TABLE-${branchId}-${idx + 1}`
      }).write();
    });

    // A minimal starter category set so the menu-item form isn't empty on day one.
    ['Starters', 'Main Course', 'Desserts', 'Drinks'].forEach(catName => {
      db.get('menuCategories').push({ id: nanoid(), branchId, name: catName }).write();
    });

    const admin = {
      id: nanoid(), role: 'restaurant_admin', name: adminName, email: adminEmail,
      branchId, restaurantId, passwordHash: hash('password')
    };
    db.get('users').push(admin).write();

    return { restaurant, branch, admin: { name: admin.name, email: admin.email, role: admin.role } };
  }

  // Require super admin role for all routes below
  router.use(authRequired);
  router.use(requireRole('super_admin'));

  // Directly create + activate a new restaurant (no approval step needed — Super Admin did it themselves)
  router.post('/restaurants', (req, res) => {
    const result = provisionRestaurant(req.body);
    res.status(201).json(result);
  });

  // Self-registration requests submitted from the public login page
  router.get('/restaurant-requests', (req, res) => {
    const requests = db.get('restaurantRequests').value().slice().sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    res.json(requests);
  });

  router.patch('/restaurant-requests/:id/approve', (req, res) => {
    const reqRef = db.get('restaurantRequests').find({ id: req.params.id });
    const request = reqRef.value();
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(409).json({ error: `Request already ${request.status}` });

    const result = provisionRestaurant(request);
    reqRef.assign({ status: 'approved', decidedAt: new Date().toISOString(), createdRestaurantId: result.restaurant.id }).write();
    res.json({ request: reqRef.value(), ...result });
  });

  router.patch('/restaurant-requests/:id/reject', (req, res) => {
    const { reason } = req.body;
    const reqRef = db.get('restaurantRequests').find({ id: req.params.id });
    if (!reqRef.value()) return res.status(404).json({ error: 'Request not found' });
    if (reqRef.value().status !== 'pending') return res.status(409).json({ error: `Request already ${reqRef.value().status}` });
    reqRef.assign({ status: 'rejected', decidedAt: new Date().toISOString(), rejectionReason: reason || '' }).write();
    res.json(reqRef.value());
  });

  // Platform analytics dashboard
  router.get('/dashboard', (req, res) => {
    const restaurants = db.get('restaurants').value();
    const users = db.get('users').value();
    const orders = db.get('orders').value();
    const branches = db.get('branches').value();
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const completedOrders = orders.filter(o => o.status === 'completed').length;

    res.json({
      totalRestaurants: restaurants.length,
      totalUsers: users.length,
      totalOrders: orders.length,
      completedOrders,
      totalRevenue,
      avgOrderValue: orders.length > 0 ? (totalRevenue / orders.length).toFixed(2) : 0,
      restaurantBreakdown: restaurants.map(r => {
        // Orders only carry a branchId, not a restaurantId, so join through branches to attribute them correctly
        const branchIds = branches.filter(b => b.restaurantId === r.id).map(b => b.id);
        const restaurantOrders = orders.filter(o => branchIds.includes(o.branchId));
        return {
          id: r.id,
          name: r.name,
          status: r.status || 'active',
          branches: branchIds.length,
          orders: restaurantOrders.length,
          revenue: restaurantOrders.reduce((sum, o) => sum + (o.total || 0), 0)
        };
      })
    });
  });

  // Get all restaurants
  router.get('/restaurants', (req, res) => {
    const restaurants = db.get('restaurants').value();
    const orders = db.get('orders').value();
    const branches = db.get('branches').value();
    const withDetails = restaurants.map(r => {
      const branchIds = branches.filter(b => b.restaurantId === r.id).map(b => b.id);
      const restaurantOrders = orders.filter(o => branchIds.includes(o.branchId));
      return {
        ...r,
        branchCount: branchIds.length,
        admins: db.get('users').filter({ restaurantId: r.id, role: 'restaurant_admin' }).value().length,
        orders: restaurantOrders.length,
        revenue: restaurantOrders.reduce((sum, o) => sum + (o.total || 0), 0),
        status: r.status || 'pending'
      };
    });
    res.json(withDetails);
  });

  // Get all platform branches for Super Admin
  router.get('/branches', (req, res) => {
    const restaurants = db.get('restaurants').value();
    const branches = db.get('branches').value().map(b => ({
      ...b,
      restaurantName: (restaurants.find(r => r.id === b.restaurantId) || {}).name || 'Unknown'
    }));
    res.json(branches);
  });

  // Approve/suspend restaurant
  router.patch('/restaurants/:id/status', (req, res) => {
    const { status } = req.body; // 'active' | 'suspended' | 'pending'
    
    const restaurant = db.get('restaurants').find({ id: req.params.id }).value();
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    db.get('restaurants').find({ id: req.params.id }).assign({ status }).write();

    res.json({ ...restaurant, status });
  });

  // Get all users
  router.get('/users', (req, res) => {
    const users = db.get('users').value().map(u => ({
      ...u,
      passwordHash: undefined // Never expose password
    }));
    res.json(users);
  });

  // Suspend user
  router.patch('/users/:id/suspend', (req, res) => {
    const user = db.get('users').find({ id: req.params.id }).value();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.get('users').find({ id: req.params.id }).assign({ suspended: true }).write();
    res.json({ ...user, suspended: true });
  });

  // Unsuspend user
  router.patch('/users/:id/unsuspend', (req, res) => {
    const user = db.get('users').find({ id: req.params.id }).value();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.get('users').find({ id: req.params.id }).assign({ suspended: false }).write();
    res.json({ ...user, suspended: false });
  });

  // Get platform audit logs
  router.get('/audit-logs', (req, res) => {
    const logs = db.get('auditLogs')
      .value()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 500);
    res.json(logs);
  });

  // Get payment analytics
  router.get('/payments/analytics', (req, res) => {
    const payments = db.get('payments').value();
    const byMethod = {};
    const byStatus = {};

    payments.forEach(p => {
      byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    });

    res.json({
      totalPayments: payments.length,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      byMethod,
      byStatus,
      successRate: payments.filter(p => p.status === 'completed').length / payments.length
    });
  });

  // Platform settings (get/update)
  router.get('/settings', (req, res) => {
    const settings = db.get('settings').value() || {
      platformFee: 5,
      taxRate: 5,
      platformName: 'The Copper Fork',
      supportEmail: 'support@thecopperfolk.com'
    };
    res.json(settings);
  });

  router.patch('/settings', (req, res) => {
    const settings = { ...db.get('settings').value(), ...req.body };
    db.set('settings', settings).write();
    res.json(settings);
  });

  return router;
};
