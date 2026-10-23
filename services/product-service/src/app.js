const express = require('express');
const mongoose = require('mongoose');
const Product = require('./models/product');
const { createAuthMiddleware } = require('./middleware/auth');

function parseProductInput(body, partial = false) {
  const input = {};

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 200) {
      return { error: 'name must be a non-empty string of at most 200 characters' };
    }
    input.name = body.name.trim();
  }

  if (!partial || body.description !== undefined) {
    if (
      typeof body.description !== 'string' ||
      body.description.trim().length > 2000
    ) {
      return { error: 'description must be a string of at most 2000 characters' };
    }
    input.description = body.description.trim();
  }

  if (!partial || body.price !== undefined) {
    if (
      typeof body.price !== 'number' ||
      !Number.isFinite(body.price) ||
      body.price < 0
    ) {
      return { error: 'price must be a non-negative number' };
    }
    input.price = body.price;
  }

  if (!partial || body.stock !== undefined) {
    if (!Number.isInteger(body.stock) || body.stock < 0) {
      return { error: 'stock must be a non-negative integer' };
    }
    input.stock = body.stock;
  }

  return { input };
}

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function createApp(config) {
  const app = express();
  const authenticate = createAuthMiddleware(config.jwtSecret);

  app.use(express.json());

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/products', async (req, res, next) => {
    try {
      const products = await Product.find().sort({ createdAt: -1 });
      return res.status(200).json({ products });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/products/:id', async (req, res, next) => {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      return res.status(200).json({ product });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/products', authenticate, async (req, res, next) => {
    const { input, error } = parseProductInput(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    try {
      const product = await Product.create(input);
      return res.status(201).json({ product });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/products/:id', authenticate, async (req, res, next) => {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const { input, error } = parseProductInput(req.body, true);
    if (error || Object.keys(input).length === 0) {
      return res.status(400).json({ error: error || 'At least one product field is required' });
    }

    try {
      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: input },
        { new: true, runValidators: true }
      );
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      return res.status(200).json({ product });
    } catch (error) {
      return next(error);
    }
  });

  app.patch('/products/:id/stock', authenticate, async (req, res, next) => {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const hasAbsoluteStock = req.body.stock !== undefined;
    const hasReduction = req.body.quantity !== undefined;
    if (hasAbsoluteStock === hasReduction) {
      return res.status(400).json({ error: 'Provide either stock or quantity' });
    }

    if (hasAbsoluteStock) {
      if (!Number.isInteger(req.body.stock) || req.body.stock < 0) {
        return res.status(400).json({ error: 'stock must be a non-negative integer' });
      }

      try {
        const product = await Product.findByIdAndUpdate(
          req.params.id,
          { $set: { stock: req.body.stock } },
          { new: true, runValidators: true }
        );
        if (!product) {
          return res.status(404).json({ error: 'Product not found' });
        }
        return res.status(200).json({ product });
      } catch (error) {
        return next(error);
      }
    }

    if (!Number.isInteger(req.body.quantity) || req.body.quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    try {
      const product = await Product.findOneAndUpdate(
        { _id: req.params.id, stock: { $gte: req.body.quantity } },
        { $inc: { stock: -req.body.quantity } },
        { new: true, runValidators: true }
      );

      if (product) {
        return res.status(200).json({ product });
      }

      const existingProduct = await Product.exists({ _id: req.params.id });
      return existingProduct
        ? res.status(409).json({ error: 'Not enough stock' })
        : res.status(404).json({ error: 'Product not found' });
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

