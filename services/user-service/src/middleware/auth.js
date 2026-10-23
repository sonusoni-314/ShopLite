const jwt = require('jsonwebtoken');

function createAuthMiddleware(jwtSecret) {
  return function authenticate(req, res, next) {
    const authorization = req.get('Authorization');

    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authorization.slice('Bearer '.length).trim();

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      req.user = jwt.verify(token, jwtSecret);
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

module.exports = { createAuthMiddleware };
