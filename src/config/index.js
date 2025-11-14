// 配置文件
module.exports = {
  port: process.env.PORT || 3000,
  
  // 缓存配置
  cache: {
    ttl: 30 * 60 * 1000, // 30分钟
    maxSize: 100 // 最多缓存100个结果
  },
  
  // 重试配置
  retry: {
    maxAttempts: 3,
    delay: 1000 // 1秒
  },
  
  // Puppeteer配置
  puppeteer: {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080',
      '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    ],
    timeout: 30000
  },
  
  // 站点配置
  sites: {
    aPremium: {
      name: 'A-Premium',
      url: 'https://a-premium.com/',
      enabled: true
    },
    sixity: {
      name: 'Sixity Auto',
      url: 'https://www.sixityauto.com/',
      enabled: true
    },
    dorman: {
      name: 'Dorman',
      url: 'https://www.dormanproducts.com/',
      enabled: true
    },
    autodoc: {
      name: 'AUTODOC',
      url: 'https://www.autodoc.parts/',
      enabled: true
    }
  },
  
  // 日志级别
  logLevel: process.env.LOG_LEVEL || 'info'
};
