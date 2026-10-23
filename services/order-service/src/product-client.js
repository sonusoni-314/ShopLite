const axios = require('axios');

function createProductClient(config) {
  const baseUrl = config.productServiceUrl.replace(/\/+$/, '');

  function requestConfig(token) {
    return {
      timeout: config.productServiceTimeoutMs,
      headers: {
        Authorization: `Bearer ${token}`
      }
    };
  }

  async function getProduct(productId, token) {
    const response = await axios.get(
      `${baseUrl}/products/${productId}`,
      requestConfig(token)
    );
    return response.data.product;
  }

  async function reduceStock(productId, quantity, token) {
    const response = await axios.patch(
      `${baseUrl}/products/${productId}/stock`,
      { quantity },
      requestConfig(token)
    );
    return response.data.product;
  }

  return { getProduct, reduceStock };
}

module.exports = { createProductClient };

