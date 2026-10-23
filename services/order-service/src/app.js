const express = require('express');
const mongoose = require('mongoose');
const Order = require('./models/order');
const { createAuthMiddleware } = require('./middleware/auth');
const { createProductClient } = require('./product-client');

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function isProductServiceUnavailable(error) {
  return !error.response || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
}

function createApp(config, productClient = createProductClient(config)) {
  const app = express();
  const authenticate = createAuthMiddleware(config.jwtSecret);

  app.use(express.json());

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/orders', authenticate, async (req, res, next) => {
    const { productId, quantity } = req.body;

    if (!isValidId(productId)) {
      return res.status(400).json({ error: 'productId must be a valid product ID' });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    const token = req.get('Authorization').slice('Bearer '.length).trim();

    try {
      let product;
      try {
        product = await productClient.getProduct(productId, token);
      } catch (error) {
        if (error.response && error.response.status === 404) {
          return res.status(404).json({ error: 'Product not found' });
        }
        if (isProductServiceUnavailable(error)) {
          return res.status(503).json({ error: 'Product Service is unavailable' });
        }
        return next(error);
      }

      if (!product || typeof product.price !== 'number') {
        return res.status(503).json({ error: 'Product Service returned invalid data' });
      }

      let updatedProduct;
      try {
        updatedProduct = await productClient.reduceStock(productId, quantity, token);
      } catch (error) {
        if (error.response && error.response.status === 404) {
          return res.status(404).json({ error: 'Product not found' });
        }
        if (error.response && error.response.status === 409) {
          return res.status(409).json({ error: 'Not enough stock' });
        }
        if (isProductServiceUnavailable(error)) {
          return res.status(503).json({ error: 'Product Service is unavailable' });
        }
        return next(error);
      }

      const order = await Order.create({
        userId: req.user.userId,
        productId,
        quantity,
        totalPrice: product.price * quantity,
        status: 'placed'
      });

      return res.status(201).json({
        order,
        product: updatedProduct
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/orders', authenticate, async (req, res, next) => {
    try {
      const orders = await Order.find({ userId: req.user.userId }).sort({ createdAt: -1 });
      return res.status(200).json({ orders });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/orders/:id', authenticate, async (req, res, next) => {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    try {
      const order = await Order.findOne({
        _id: req.params.id,
        userId: req.user.userId
      });
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      return res.status(200).json({ order });
    } catch (error) {
      return next(error);
    }
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };

