const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

module.exports = (io) => {
  const router = express.Router();

  // Get reviews for an item or restaurant
  router.get('/:type/:id', (req, res) => {
    const { type, id } = req.params;
    const reviews = db.get('reviews')
      .filter({ [`${type}Id`]: id })
      .value();

    const withAuthor = reviews.map(r => ({
      ...r,
      author: db.get('users').find({ id: r.userId }).value()
    }));

    res.json(withAuthor);
  });

  // Get user's reviews
  router.get('/user/all', authRequired, (req, res) => {
    const userId = req.user.id;
    const reviews = db.get('reviews')
      .filter({ userId })
      .value();
    res.json(reviews);
  });

  // Add a review
  router.post('/', authRequired, (req, res) => {
    const { menuItemId, restaurantId, rating, text, photos = [] } = req.body;
    const userId = req.user.id;

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const review = {
      id: nanoid(),
      userId,
      menuItemId,
      restaurantId,
      rating,
      text,
      photos,
      helpful: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.get('reviews').push(review).write();

    // Update item/restaurant average rating
    if (menuItemId) {
      const itemReviews = db.get('reviews').filter({ menuItemId }).value();
      const avgRating = (itemReviews.reduce((sum, r) => sum + r.rating, 0) / itemReviews.length).toFixed(1);
      db.get('menuItems').find({ id: menuItemId }).assign({ rating: avgRating }).write();
    }

    res.status(201).json(review);
  });

  // Update review
  router.patch('/:id', authRequired, (req, res) => {
    const review = db.get('reviews').find({ id: req.params.id }).value();

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (review.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updated = {
      ...review,
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    db.get('reviews').find({ id: req.params.id }).assign(updated).write();
    res.json(updated);
  });

  // Delete review
  router.delete('/:id', authRequired, (req, res) => {
    const review = db.get('reviews').find({ id: req.params.id }).value();

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (review.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    db.get('reviews').remove({ id: req.params.id }).write();
    res.json({ success: true });
  });

  return router;
};
