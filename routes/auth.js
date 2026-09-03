const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const { SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.get('users').find({ email }).value();
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.active === false) {
    return res.status(403).json({ error: 'This account has been disabled. Contact your restaurant admin.' });
  }
  const payload = {
    id: user.id, role: user.role, name: user.name,
    branchId: user.branchId, restaurantId: user.restaurantId
  };
  const token = jwt.sign(payload, SECRET, { expiresIn: '12h' });
  res.json({ token, user: payload });
});

// Optional registration endpoint used by the mobile client (creates a customer)
router.post('/register', (req, res) => {
  const { name, email, phone, password, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }

  const exists = db.get('users').find({ email }).value();
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  // Attach to the first branch by default so the user can browse menus immediately.
  const branch = db.get('branches').value()[0] || null;
  const branchId = branch ? branch.id : null;
  const restaurantId = branch ? branch.restaurantId : null;

  const userId = nanoid();
  const passwordHash = bcrypt.hashSync(password, 8);

  const newUser = {
    id: userId,
    name,
    email,
    phone: phone || '',
    role: role || 'customer',
    branchId,
    restaurantId,
    passwordHash,
    active: true,
  };
  db.get('users').push(newUser).write();

  const payload = { id: userId, role: newUser.role, name: newUser.name, branchId, restaurantId };
  const token = jwt.sign(payload, SECRET, { expiresIn: '12h' });
  res.status(201).json({ token, user: payload });
});

router.get('/demo-accounts', (req, res) => {
  const users = db.get('users')
    .filter(u => u.active !== false)
    .sortBy(['role','name'])
    .value()
    .map(u => ({ role: u.role, email: u.email, name: u.name }));
  res.json({ users, password: 'password' });
});

module.exports = router;
