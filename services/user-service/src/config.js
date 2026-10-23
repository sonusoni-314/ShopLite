const dotenv = require('dotenv');

dotenv.config();

function getConfig() {
  const config = {
    port: Number(process.env.PORT || 3001),
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h'
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

  return config;
}

module.exports = { getConfig };

