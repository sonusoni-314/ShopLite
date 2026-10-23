const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../src/models/product');
const { createApp } = require('../src/app');

jest.setTimeout(30000);

const config = {
  jwtSecret: 'test-secret-that-is-long-enough'
};
const token = jwt.sign({ userId: new mongoose.Types.ObjectId().toString() }, config.jwtSecret);

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp(config);
});

afterEach(async () => {
  await Product.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Product Service', () => {
  test('GET /health returns a healthy status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('GET /products is public and lists products', async () => {
    await Product.create({
      name: 'Keyboard',
      description: 'Mechanical keyboard',
      price: 99.99,
      stock: 10
    });

    const response = await request(app).get('/products');

    expect(response.status).toBe(200);
    expect(response.body.products).toHaveLength(1);
    expect(response.body.products[0]).toMatchObject({
      name: 'Keyboard',
      price: 99.99,
      stock: 10
    });
  });

  test('POST /products requires authentication', async () => {
    const response = await request(app).post('/products').send({
      name: 'Mouse',
      description: 'Wireless mouse',
      price: 25,
      stock: 5
    });

    expect(response.status).toBe(401);
  });

  test('POST /products creates a valid product for an authenticated user', async () => {
    const response = await request(app)
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Mouse',
        description: ' Wireless mouse ',
        price: 25,
        stock: 5
      });

    expect(response.status).toBe(201);
    expect(response.body.product).toMatchObject({
      name: 'Mouse',
      description: 'Wireless mouse',
      price: 25,
      stock: 5
    });
  });

  test.each([
    { name: '', description: 'Description', price: 10, stock: 1 },
    { name: 'Product', description: 'Description', price: -1, stock: 1 },
    { name: 'Product', description: 'Description', price: 10, stock: -1 },
    { name: 'Product', description: 'Description', price: 10, stock: 1.5 }
  ])('POST /products rejects invalid data: %j', async (payload) => {
    const response = await request(app)
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(400);
  });

  test('GET /products/:id returns a product and 404 for a missing product', async () => {
    const product = await Product.create({
      name: 'Monitor',
      description: '4K monitor',
      price: 300,
      stock: 2
    });

    const found = await request(app).get(`/products/${product.id}`);
    const missing = await request(app).get(`/products/${new mongoose.Types.ObjectId()}`);

    expect(found.status).toBe(200);
    expect(found.body.product.name).toBe('Monitor');
    expect(missing.status).toBe(404);
  });

  test('PUT /products/:id updates a product', async () => {
    const product = await Product.create({
      name: 'Old name',
      description: 'Old description',
      price: 10,
      stock: 2
    });

    const response = await request(app)
      .put(`/products/${product.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New name', price: 12.5 });

    expect(response.status).toBe(200);
    expect(response.body.product).toMatchObject({
      name: 'New name',
      description: 'Old description',
      price: 12.5,
      stock: 2
    });
  });

  test('PATCH /products/:id/stock reduces stock atomically', async () => {
    const product = await Product.create({
      name: 'Headphones',
      description: 'Noise cancelling',
      price: 80,
      stock: 5
    });

    const response = await request(app)
      .patch(`/products/${product.id}/stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 2 });

    expect(response.status).toBe(200);
    expect(response.body.product.stock).toBe(3);
  });

  test('PATCH /products/:id/stock supports setting stock and rejects underflow', async () => {
    const product = await Product.create({
      name: 'Camera',
      description: 'Digital camera',
      price: 500,
      stock: 2
    });

    const setResponse = await request(app)
      .patch(`/products/${product.id}/stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stock: 4 });
    const underflowResponse = await request(app)
      .patch(`/products/${product.id}/stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 5 });

    expect(setResponse.status).toBe(200);
    expect(setResponse.body.product.stock).toBe(4);
    expect(underflowResponse.status).toBe(409);
  });
});
