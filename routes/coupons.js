const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

module.exports = (io) => {
  const router = express.Router();

  // Get active coupons for a specific restaurant (customer view) — coupons are tenant-scoped,
  // a coupon created by one restaurant must never be usable at another's checkout.
  router.get('/', (req, res) => {
    const { restaurantId } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const coupons = db.get('coupons')
      .filter(c => c.restaurantId === restaurantId && c.active && new Date(c.validTill) > new Date())
      .value()
      .map(c => ({
        id: c.id,
        code: c.code,
        description: c.description,
        discountType: c.discountType,
        discountValue: c.discountValue,
        minOrderValue: c.minOrderValue || 0
      }));
    res.json(coupons);
  });

  // Validate coupon code — also tenant-scoped, so Restaurant A's code can't be redeemed at Restaurant B
  router.post('/validate', (req, res) => {
    const { code, orderValue, restaurantId } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const coupon = db.get('coupons')
      .find({ code, restaurantId, active: true })
      .value();

    if (!coupon) {
      return res.status(400).json({ error: 'Invalid coupon code' });
    }

    if (new Date(coupon.validTill) < new Date()) {
      return res.status(400).json({ error: 'Coupon has expired' });
    }

    if (coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ error: 'Coupon usage limit reached' });
    }

    if (coupon.minOrderValue && orderValue < coupon.minOrderValue) {
      return res.status(400).json({ 
        error: `Minimum order value of ₹${coupon.minOrderValue} required` 
      });
    }

    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = Math.round(orderValue * coupon.discountValue / 100);
    } else {
      discount = coupon.discountValue;
    }

    res.json({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discount,
      discountType: coupon.discountType
    });
  });

  // Apply coupon (increment usage)
  router.post('/:id/apply', (req, res) => {
    const coupon = db.get('coupons').find({ id: req.params.id }).value();

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    db.get('coupons')
      .find({ id: req.params.id })
      .assign({ usedCount: coupon.usedCount + 1 })
      .write();

    res.json({ success: true });
  });

  // Admin: Get all coupons for the admin's own restaurant (Super Admin can pass ?restaurantId= to inspect any one)
  router.get('/admin/all', authRequired, requireRole('super_admin', 'restaurant_admin'), (req, res) => {
    const restaurantId = req.user.role === 'super_admin' ? (req.query.restaurantId || req.user.restaurantId) : req.user.restaurantId;
    const coupons = db.get('coupons').filter({ restaurantId }).value();
    res.json(coupons);
  });

  // Admin: Create coupon, scoped to the admin's own restaurant
  router.post('/admin/create', authRequired, requireRole('super_admin', 'restaurant_admin'), (req, res) => {
    const { code, discountType, discountValue, description, maxUses, minOrderValue, validTill } = req.body;
    const restaurantId = req.user.restaurantId;

    // Code uniqueness only needs to hold within a restaurant, not platform-wide
    if (db.get('coupons').find({ code, restaurantId }).value()) {
      return res.status(400).json({ error: 'Coupon code already exists for this restaurant' });
    }

    const coupon = {
      id: nanoid(),
      restaurantId,
      code,
      discountType,
      discountValue,
      description,
      maxUses: maxUses || 999,
      minOrderValue: minOrderValue || 0,
      usedCount: 0,
      active: true,
      validTill: validTill || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };

    db.get('coupons').push(coupon).write();
    res.status(201).json(coupon);
  });

  // Admin: Update coupon (full field edit — code, description, discount, validity, min order, active)
  router.patch('/admin/:id', authRequired, requireRole('super_admin', 'restaurant_admin'), (req, res) => {
    const coupon = db.get('coupons').find({ id: req.params.id }).value();

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }
    if (req.user.role === 'restaurant_admin' && coupon.restaurantId !== req.user.restaurantId) {
      return res.status(403).json({ error: "You can't edit another restaurant's coupon" });
    }

    // Never allow the restaurantId or id to be overwritten via this endpoint
    const { restaurantId, id, ...safeUpdates } = req.body;
    const updated = { ...coupon, ...safeUpdates, id: coupon.id, restaurantId: coupon.restaurantId };
    db.get('coupons').find({ id: req.params.id }).assign(updated).write();
    res.json(updated);
  });

  // Admin: Delete coupon
  router.delete('/admin/:id', authRequired, requireRole('super_admin', 'restaurant_admin'), (req, res) => {
    const coupon = db.get('coupons').find({ id: req.params.id }).value();
    if (coupon && req.user.role === 'restaurant_admin' && coupon.restaurantId !== req.user.restaurantId) {
      return res.status(403).json({ error: "You can't delete another restaurant's coupon" });
    }
    db.get('coupons').remove({ id: req.params.id }).write();
    res.json({ success: true });
  });

  return router;
};
