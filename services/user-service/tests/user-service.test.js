const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/user');
const { createApp } = require('../src/app');

jest.setTimeout(30000);

const config = {
  jwtSecret: 'test-secret-that-is-long-enough',
  jwtExpiresIn: '1h'
};

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp(config);
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('User Service', () => {
  test('GET /health returns a healthy status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('POST /users/register creates a user without exposing the password', async () => {
    const response = await request(app).post('/users/register').send({
      name: ' Sonu ',
      email: 'SONU@example.com',
      password: 'correct-horse'
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      name: 'Sonu',
      email: 'sonu@example.com'
    });
    expect(response.body.user.passwordHash).toBeUndefined();

    const savedUser = await User.findOne({ email: 'sonu@example.com' }).select('+passwordHash');
    expect(savedUser).not.toBeNull();
    expect(savedUser.passwordHash).not.toBe('correct-horse');
    expect(await bcrypt.compare('correct-horse', savedUser.passwordHash)).toBe(true);
  });

  test.each([
    [{ name: '', email: 'valid@example.com', password: 'correct-horse' }],
    [{ name: 'Valid', email: 'invalid', password: 'correct-horse' }],
    [{ name: 'Valid', email: 'valid@example.com', password: 'short' }]
  ])('POST /users/register rejects invalid input', async (payload) => {
    const response = await request(app).post('/users/register').send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  test('POST /users/register rejects duplicate email', async () => {
    await User.create({
      name: 'Existing',
      email: 'existing@example.com',
      passwordHash: 'hash'
    });

    const response = await request(app).post('/users/register').send({
      name: 'Another',
      email: 'EXISTING@example.com',
      password: 'correct-horse'
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Email is already registered');
  });

  test('POST /users/login returns a JWT for valid credentials', async () => {
    await request(app).post('/users/register').send({
      name: 'Login User',
      email: 'login@example.com',
      password: 'correct-horse'
    });

    const response = await request(app).post('/users/login').send({
      email: 'LOGIN@example.com',
      password: 'correct-horse'
    });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(jwt.verify(response.body.token, config.jwtSecret)).toMatchObject({
      email: 'login@example.com'
    });
  });

  test('POST /users/login rejects invalid credentials', async () => {
    const response = await request(app).post('/users/login').send({
      email: 'missing@example.com',
      password: 'wrong-password'
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid email or password');
  });

  test('GET /users/me rejects a missing token', async () => {
    const response = await request(app).get('/users/me');

    expect(response.status).toBe(401);
  });

  test('GET /users/me rejects an invalid token', async () => {
    const response = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
  });

  test('GET /users/me returns the authenticated user', async () => {
    const registration = await request(app).post('/users/register').send({
      name: 'Me User',
      email: 'me@example.com',
      password: 'correct-horse'
    });
    const login = await request(app).post('/users/login').send({
      email: 'me@example.com',
      password: 'correct-horse'
    });

    const response = await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: registration.body.user.id,
      name: 'Me User',
      email: 'me@example.com'
    });
  });
});
