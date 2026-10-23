const mongoose = require('mongoose');
const { createApp } = require('./app');
const { getConfig } = require('./config');

async function start() {
  const config = getConfig();
  await mongoose.connect(config.mongoUri);
  const app = createApp(config);
  const server = app.listen(config.port, () => {
    console.log(`product-service listening on port ${config.port}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('Failed to start product-service', error);
  process.exit(1);
});

