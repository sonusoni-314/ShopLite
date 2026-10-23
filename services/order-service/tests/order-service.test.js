jest.mock('axios');

const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Order = require('../src/models/order');
const { createApp } = require('../src/app');

const config = {
  jwtSecret: 'test-secret-that-is-long-enough',
  productServiceUrl: 'http://product-service:3002',
  productServiceTimeoutMs: 2500
};
const userId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();
const productId = new mongoose.Types.ObjectId();
const token = jwt.sign({ userId: userId.toString() }, config.jwtSecret);
const otherUserToken = jwt.sign({ userId: otherUserId.toString() }, config.jwtSecret);

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp(config);
});

beforeEach(() => {
  axios.get.mockReset();
  axios.patch.mockReset();
});

afterEach(async () => {
  await Order.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Order Service', () => {
  test('GET /health returns a healthy status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('POST /orders requires authentication', async () => {
    const response = await request(app).post('/orders').send({
      productId: productId.toString(),
      quantity: 1
    });

    expect(response.status).toBe(401);
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('POST /orders rejects invalid quantities before calling Product Service', async () => {
    const response = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: productId.toString(), quantity: 0 });

    expect(response.status).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('POST /orders checks the product, reduces stock, and saves the order', async () => {
    axios.get.mockResolvedValue({
      data: { product: { _id: productId.toString(), price: 19.99, stock: 5 } }
    });
    axios.patch.mockResolvedValue({
      data: { product: { _id: productId.toString(), price: 19.99, stock: 3 } }
    });

    const response = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: productId.toString(), quantity: 2 });

    expect(response.status).toBe(201);
    expect(response.body.order).toMatchObject({
      userId: userId.toString(),
      productId: productId.toString(),
      quantity: 2,
      totalPrice: 39.98,
      status: 'placed'
    });
    expect(response.body.product.stock).toBe(3);
    expect(axios.get).toHaveBeenCalledWith(
      `http://product-service:3002/products/${productId}`,
      expect.objectContaining({
        timeout: 2500,
        headers: { Authorization: `Bearer ${token}` }
      })
    );
    expect(axios.patch).toHaveBeenCalledWith(
      `http://product-service:3002/products/${productId}/stock`,
      { quantity: 2 },
      expect.objectContaining({
        timeout: 2500,
        headers: { Authorization: `Bearer ${token}` }
      })
    );
    expect(await Order.countDocuments()).toBe(1);
  });

  test('POST /orders returns 404 when Product Service cannot find the product', async () => {
    axios.get.mockRejectedValue({ response: { status: 404 } });

    const response = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: productId.toString(), quantity: 1 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Product not found');
    expect(axios.patch).not.toHaveBeenCalled();
    expect(await Order.countDocuments()).toBe(0);
  });

  test('POST /orders returns 409 when stock reduction fails', async () => {
    axios.get.mockResolvedValue({
      data: { product: { _id: productId.toString(), price: 19.99, stock: 1 } }
    });
    axios.patch.mockRejectedValue({ response: { status: 409 } });

    const response = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: productId.toString(), quantity: 2 });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Not enough stock');
    expect(await Order.countDocuments()).toBe(0);
  });

  test('POST /orders returns 503 when Product Service is down', async () => {
    axios.get.mockRejectedValue({ code: 'ECONNREFUSED' });

    const response = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: productId.toString(), quantity: 1 });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Product Service is unavailable');
    expect(await Order.countDocuments()).toBe(0);
  });

  test('POST /orders returns 503 when Product Service times out', async () => {
    axios.get.mockRejectedValue({ code: 'ECONNABORTED' });

    const response = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: productId.toString(), quantity: 1 });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Product Service is unavailable');
  });

  test('GET /orders returns only the authenticated user orders', async () => {
    await Order.create([
      {
        userId,
        productId,
        quantity: 1,
        totalPrice: 19.99,
        status: 'placed'
      },
      {
        userId: otherUserId,
        productId,
        quantity: 4,
        totalPrice: 79.96,
        status: 'placed'
      }
    ]);

    const response = await request(app)
      .get('/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.orders).toHaveLength(1);
    expect(response.body.orders[0].userId).toBe(userId.toString());
  });

  test('GET /orders/:id prevents access to another user order', async () => {
    const order = await Order.create({
      userId: otherUserId,
      productId,
      quantity: 1,
      totalPrice: 19.99,
      status: 'placed'
    });

    const response = await request(app)
      .get(`/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Order not found');
  });

  test('GET /orders/:id returns the authenticated user order', async () => {
    const order = await Order.create({
      userId,
      productId,
      quantity: 1,
      totalPrice: 19.99,
      status: 'placed'
    });

    const response = await request(app)
      .get(`/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.order._id).toBe(order.id);
  });

  test('forwards the caller JWT to Product Service', async () => {
    axios.get.mockResolvedValue({
      data: { product: { _id: productId.toString(), price: 10, stock: 2 } }
    });
    axios.patch.mockResolvedValue({
      data: { product: { _id: productId.toString(), price: 10, stock: 1 } }
    });

    await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send({ productId: productId.toString(), quantity: 1 });

    expect(axios.get.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${otherUserToken}`);
    expect(axios.patch.mock.calls[0][2].headers.Authorization).toBe(`Bearer ${otherUserToken}`);
  });
});

