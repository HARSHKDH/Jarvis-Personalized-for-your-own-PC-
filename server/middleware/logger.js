/**
 * Request logger middleware
 */
const logger = (req, res, next) => {
  const start = Date.now();
  const { method, url, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const color =
      statusCode >= 500 ? '\x1b[31m' :
      statusCode >= 400 ? '\x1b[33m' :
      statusCode >= 300 ? '\x1b[36m' :
      '\x1b[32m';

    console.log(
      `${color}[${method}]\x1b[0m ${url} ${statusCode} ${duration}ms — ${ip}`
    );
  });

  next();
};

module.exports = logger;
