// 重试工具
const config = require('../config');
const logger = require('./logger');

async function retry(fn, options = {}) {
  const maxAttempts = options.maxAttempts || config.retry.maxAttempts;
  const delay = options.delay || config.retry.delay;
  const context = options.context || 'operation';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.debug(`${context} attempt ${attempt}/${maxAttempts}`);
      return await fn();
    } catch (error) {
      logger.warn(`${context} attempt ${attempt} failed`, { 
        error: error.message,
        attempt,
        maxAttempts 
      });

      if (attempt === maxAttempts) {
        logger.error(`${context} failed after ${maxAttempts} attempts`, { 
          error: error.message 
        });
        throw error;
      }

      // 指数退避
      const waitTime = delay * Math.pow(2, attempt - 1);
      logger.debug(`Waiting ${waitTime}ms before retry`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

module.exports = retry;
