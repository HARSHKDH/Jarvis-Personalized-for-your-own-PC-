/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('[ErrorHandler]', err.message);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: true,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
