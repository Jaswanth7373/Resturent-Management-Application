const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');

module.exports = () => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const restaurants = db.get('restaurants').filter(r => (r.status || 'active') === 'active').value();
    const withBranches = restaurants.map(r => ({
      ...r,
      branches: db.get('branches').filter({ restaurantId: r.id }).value()
    }));
    res.json(withBranches);
  });

  // Public: a new restaurant owner registers themselves from the login page.
  // This does NOT create a login yet — it queues a request for Super Admin to approve,
  // matching the platform's requirement that every new tenant is vetted before going live.
  router.post('/register', (req, res) => {
    const { name, cuisine, description, address, city, type, phone, operatingHours, adminName, adminEmail } = req.body;
    if (!name || !adminName || !adminEmail) {
      return res.status(400).json({ error: 'Restaurant name, your name, and your email are required' });
    }
    if (db.get('users').find({ email: adminEmail }).value()) {
      return res.status(409).json({ error: `An account with email ${adminEmail} already exists` });
    }
    const pending = db.get('restaurantRequests').find({ adminEmail, status: 'pending' }).value();
    if (pending) {
      return res.status(409).json({ error: 'A request with this email is already pending review' });
    }
    const request = {
      id: nanoid(), name, cuisine: cuisine || '', description: description || '',
      address: address || '', city: city || '', type: type || '', phone: phone || '',
      operatingHours: operatingHours || null, adminName, adminEmail,
      status: 'pending', submittedAt: new Date().toISOString()
    };
    db.get('restaurantRequests').push(request).write();
    res.status(201).json({ message: 'Registration submitted — you\'ll be able to sign in once the platform team approves it.', request });
  });

  return router;
};
