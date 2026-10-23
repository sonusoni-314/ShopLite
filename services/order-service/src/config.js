const dotenv = require('dotenv');

dotenv.config();

function getConfig() {
  const config = {
    port: Number(process.env.PORT || 3003),
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    productServiceUrl: process.env.PRODUCT_SERVICE_URL,
    productServiceTimeoutMs: Number(process.env.PRODUCT_SERVICE_TIMEOUT_MS || 5000)
  };

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }

  if (!config.mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  if (!config.jwtSecret || config.jwtSecret.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters');
  }

  if (
    !Number.isInteger(config.productServiceTimeoutMs) ||
    config.productServiceTimeoutMs < 1
  ) {
    throw new Error('PRODUCT_SERVICE_TIMEOUT_MS must be a positive integer');
  }

  if (!config.productServiceUrl) {
    throw new Error('PRODUCT_SERVICE_URL is required');
  }

  return config;
}

module.exports = { getConfig };

