const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

module.exports = (io) => {
  const router = express.Router();

  // Record a payment
  router.post('/', authRequired, (req, res) => {
    const { orderId, amount, method, status = 'completed', transactionId } = req.body;

    const payment = {
      id: nanoid(),
      orderId,
      amount,
      method, // 'cash' | 'card' | 'upi' | 'wallet'
      status, // 'pending' | 'completed' | 'failed'
      transactionId,
      userId: req.user.id,
      branchId: req.user.branchId,
      createdAt: new Date().toISOString()
    };

    db.get('payments').push(payment).write();

    // Update order payment status
    if (orderId) {
      const order = db.get('orders').find({ id: orderId }).value();
      if (order) {
        db.get('orders')
          .find({ id: orderId })
          .assign({ paymentStatus: 'paid', paymentMethod: method })
          .write();
      }
    }

    res.status(201).json(payment);
  });

  // Get payment history for a branch
  router.get('/branch/:branchId', authRequired, (req, res) => {
    const payments = db.get('payments')
      .filter({ branchId: req.params.branchId })
      .value()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(payments);
  });

  // Get payment by order
  router.get('/order/:orderId', authRequired, (req, res) => {
    const payment = db.get('payments')
      .find({ orderId: req.params.orderId })
      .value();

    res.json(payment || null);
  });

  // Get user's payment history
  router.get('/user/history', authRequired, (req, res) => {
    const payments = db.get('payments')
      .filter({ userId: req.user.id })
      .value()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);

    res.json(payments);
  });

  // Razorpay webhook handler
  router.post('/razorpay/webhook', (req, res) => {
    const { event, payload } = req.body;

    if (event === 'payment.authorized' || event === 'payment.captured') {
      const payment = {
        id: nanoid(),
        orderId: payload.order_id,
        amount: payload.amount / 100,
        method: 'razorpay',
        status: 'completed',
        transactionId: payload.id,
        razorpayOrderId: payload.order_id,
        razorpayPaymentId: payload.id,
        createdAt: new Date().toISOString()
      };

      db.get('payments').push(payment).write();

      // Update order
      const order = db.get('orders').find({ razorpayOrderId: payload.order_id }).value();
      if (order) {
        db.get('orders')
          .find({ id: order.id })
          .assign({ paymentStatus: 'paid', paymentMethod: 'razorpay' })
          .write();
      }
    }

    res.json({ ok: true });
  });

  // Stripe webhook handler
  router.post('/stripe/webhook', (req, res) => {
    const { type, data } = req.body;

    if (type === 'charge.succeeded') {
      const payment = {
        id: nanoid(),
        orderId: data.metadata.orderId,
        amount: data.amount / 100,
        method: 'stripe',
        status: 'completed',
        transactionId: data.id,
        stripeChargeId: data.id,
        createdAt: new Date().toISOString()
      };

      db.get('payments').push(payment).write();

      // Update order
      const order = db.get('orders').find({ id: data.metadata.orderId }).value();
      if (order) {
        db.get('orders')
          .find({ id: order.id })
          .assign({ paymentStatus: 'paid', paymentMethod: 'stripe' })
          .write();
      }
    }

    res.json({ ok: true });
  });

  return router;
};
