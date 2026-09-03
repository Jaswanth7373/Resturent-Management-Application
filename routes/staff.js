const express = require('express');
const { nanoid } = require('nanoid');
const { db, hash } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

const CREATABLE_ROLES = ['sub_admin', 'waiter', 'chef', 'inventory_manager'];

module.exports = () => {
  const router = express.Router();
  router.use(authRequired);

  // List staff for a branch
  router.get('/:branchId', requireRole('restaurant_admin', 'sub_admin', 'super_admin'), (req, res) => {
    const staff = db.get('users')
      .filter(u => u.branchId === req.params.branchId && CREATABLE_ROLES.includes(u.role))
      .value()
      .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active !== false }));
    res.json(staff);
  });

  // Create a new staff account with its own login. Restaurant Admin can create for any branch of
  // their restaurant (including more Sub-Admins); Sub-Admin can only staff their own branch and
  // cannot create another Sub-Admin. All new accounts use the platform's shared demo password,
  // same convention as restaurant onboarding — see BACKLOG.md.
  router.post('/:branchId', requireRole('restaurant_admin', 'sub_admin', 'super_admin'), (req, res) => {
    const { branchId } = req.params;
    const { name, email, role } = req.body;
    if (!name || !email || !role) return res.status(400).json({ error: 'name, email, and role are required' });
    if (!CREATABLE_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of ${CREATABLE_ROLES.join(', ')}` });

    const branch = db.get('branches').find({ id: branchId }).value();
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    if (req.user.role === 'sub_admin') {
      if (branchId !== req.user.branchId) return res.status(403).json({ error: "You can only add staff to your own branch" });
      if (role === 'sub_admin') return res.status(403).json({ error: 'Only a Restaurant Admin can create another Sub-Admin' });
    }
    if (req.user.role === 'restaurant_admin' && branch.restaurantId !== req.user.restaurantId) {
      return res.status(403).json({ error: "You can only add staff to your own restaurant's branches" });
    }

    if (db.get('users').find({ email }).value()) {
      return res.status(409).json({ error: `An account with email ${email} already exists` });
    }

    const staffMember = {
      id: nanoid(), role, name, email,
      branchId, restaurantId: branch.restaurantId,
      passwordHash: hash('password'), active: true
    };
    db.get('users').push(staffMember).write();
    res.status(201).json({ id: staffMember.id, name, email, role, active: true });
  });

  // Enable/disable a staff login without deleting their history
  router.patch('/:userId/active', requireRole('restaurant_admin', 'sub_admin', 'super_admin'), (req, res) => {
    const { active } = req.body;
    const userRef = db.get('users').find({ id: req.params.userId });
    const staffMember = userRef.value();
    if (!staffMember || !CREATABLE_ROLES.includes(staffMember.role)) return res.status(404).json({ error: 'Staff member not found' });
    if (req.user.role === 'sub_admin' && staffMember.branchId !== req.user.branchId) {
      return res.status(403).json({ error: "You can only manage staff on your own branch" });
    }
    userRef.assign({ active: !!active }).write();
    res.json({ id: staffMember.id, active: !!active });
  });

  return router;
};
