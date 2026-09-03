const express = require('express');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

module.exports = () => {
  const router = express.Router();

  // Get user's favorite items
  router.get('/user', authRequired, (req, res) => {
    const userId = req.user.id;
    const favorites = db.get('favorites')
      .filter({ userId })
      .value()
      .map(fav => ({
        ...fav,
        item: db.get('menuItems').find({ id: fav.menuItemId }).value()
      }));
    res.json(favorites);
  });

  // Get user's favorite restaurants
  router.get('/restaurants', authRequired, (req, res) => {
    const userId = req.user.id;
    const branchId = req.query.branchId;
    const favorites = db.get('favorites')
      .filter({ userId, type: 'restaurant' })
      .value();
    res.json(favorites);
  });

  // Add to favorites
  router.post('/', authRequired, (req, res) => {
    const { menuItemId, restaurantId, branchId, type = 'item' } = req.body;
    const userId = req.user.id;

    // Check if already favorited
    const existing = db.get('favorites')
      .find({ userId, menuItemId, restaurantId, type })
      .value();

    if (existing) {
      return res.status(400).json({ error: 'Already in favorites' });
    }

    const favorite = {
      id: require('nanoid').nanoid(),
      userId,
      menuItemId,
      restaurantId,
      branchId,
      type,
      addedAt: new Date().toISOString()
    };

    db.get('favorites').push(favorite).write();
    res.status(201).json(favorite);
  });

  // Remove from favorites
  router.delete('/:id', authRequired, (req, res) => {
    const favorite = db.get('favorites').find({ id: req.params.id }).value();
    
    if (!favorite) {
      return res.status(404).json({ error: 'Favorite not found' });
    }

    if (favorite.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    db.get('favorites').remove({ id: req.params.id }).write();
    res.json({ success: true });
  });

  return router;
};
