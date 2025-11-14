// 简单的内存缓存实现
const config = require('../config');
const logger = require('./logger');

class SimpleCache {
  constructor() {
    this.cache = new Map();
    this.timestamps = new Map();
  }

  set(key, value, ttl = config.cache.ttl) {
    // 如果缓存已满，删除最旧的项
    if (this.cache.size >= config.cache.maxSize) {
      const oldestKey = this.findOldestKey();
      this.delete(oldestKey);
    }

    this.cache.set(key, value);
    this.timestamps.set(key, Date.now() + ttl);
    logger.debug('Cache set', { key, ttl });
  }

  get(key) {
    const timestamp = this.timestamps.get(key);
    
    if (!timestamp) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > timestamp) {
      this.delete(key);
      logger.debug('Cache expired', { key });
      return null;
    }

    logger.debug('Cache hit', { key });
    return this.cache.get(key);
  }

  delete(key) {
    this.cache.delete(key);
    this.timestamps.delete(key);
  }

  findOldestKey() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, timestamp] of this.timestamps.entries()) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  clear() {
    this.cache.clear();
    this.timestamps.clear();
    logger.info('Cache cleared');
  }

  size() {
    return this.cache.size;
  }
}

module.exports = new SimpleCache();
