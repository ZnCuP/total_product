// Puppeteer爬虫服务
const puppeteer = require('puppeteer');
const config = require('../config');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const retry = require('../utils/retry');

class ScraperService {
  constructor() {
    this.browser = null;
    this.isInitialized = false;
  }

  // 初始化浏览器
  async initialize() {
    if (this.isInitialized && this.browser) {
      return;
    }

    try {
      logger.info('Initializing Puppeteer browser');
      this.browser = await puppeteer.launch(config.puppeteer);
      this.isInitialized = true;
      logger.info('Puppeteer browser initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Puppeteer', { error: error.message });
      throw error;
    }
  }

  // 获取新页面
  async getPage() {
    await this.initialize();
    const page = await this.browser.newPage();
    
    // 设置视口
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 设置额外的请求头
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    return page;
  }

  // A-Premium: 搜索产品
  async searchAPremium(keyword) {
    const cacheKey = `apremium:search:${keyword}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    return retry(async () => {
      try {
        const searchUrl = `https://a-premium.com/search?keyword=${encodeURIComponent(keyword)}`;
        
        const page = await this.getPage();
        try {
          await page.goto(searchUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: config.puppeteer.timeout 
          });
          
          // 等待产品加载
          await page.waitForTimeout(3000);
          
          const items = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[class*="ProductCard"], [class*="product-card"], .product-item, [data-product-card]');
            
            cards.forEach(card => {
              const link = card.querySelector('a[href*="/product/"]');
              const titleEl = card.querySelector('[class*="title"], [class*="name"], h2, h3, h4');
              const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
              const imgEl = card.querySelector('img');
              
              if (link && titleEl) {
                const title = titleEl.textContent.trim();
                const url = link.href;
                const price = priceEl ? priceEl.textContent.trim() : '';
                const image = imgEl ? imgEl.src : '';
                
                if (title && url) {
                  results.push({ title, url, price, image });
                }
              }
            });
            
            return results.slice(0, 12);
          });
          
          const result = { 
            items, 
            metaTitle: 'A-Premium',
            source: 'A-Premium'
          };
          
          cache.set(cacheKey, result);
          logger.info('A-Premium search completed', { keyword, count: items.length });
          
          return result;
        } finally {
          await page.close();
        }
      } catch (error) {
        logger.error('A-Premium search failed', { keyword, error: error.message });
        throw error;
      }
    }, { context: 'A-Premium search' });
  }

  // Sixity Auto: 搜索产品
  async searchSixity(keyword) {
    const cacheKey = `sixity:search:${keyword}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    return retry(async () => {
      const domain = 'https://www.sixityauto.com/search?q=' + encodeURIComponent(keyword);
      const apiUrl = 'https://hzbon8.a.searchspring.io/api/search/search.json?ajaxCatalog=v3&resultsFormat=native&siteId=hzbon8&domain=' + 
        encodeURIComponent(domain) + '&q=' + encodeURIComponent(keyword) + '&noBeacon=true';
      
      const page = await this.getPage();
      try {
        await page.goto(apiUrl, { 
          waitUntil: 'networkidle0',
          timeout: config.puppeteer.timeout 
        });
        
        const content = await page.evaluate(() => document.body.textContent);
        const json = JSON.parse(content);
        
        const results = Array.isArray(json.results) ? json.results : [];
        const items = results.slice(0, 12).map(r => ({
          title: r.name || '',
          url: r.url || '',
          price: r.price ? `$${r.price}` : '',
          image: r.thumbnailImageUrl || ''
        }));
        
        const result = { 
          items,
          metaTitle: 'Sixity Auto',
          source: 'Sixity Auto'
        };
        
        cache.set(cacheKey, result);
        logger.info('Sixity Auto search completed', { keyword, count: items.length });
        
        return result;
      } finally {
        await page.close();
      }
    }, { context: 'Sixity Auto search' });
  }

  // Dorman: 搜索产品
  async searchDorman(keyword) {
    const cacheKey = `dorman:search:${keyword}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    return retry(async () => {
      const searchUrl = 'https://www.dormanproducts.com/gsearch.aspx?type=keyword&origin=keyword&q=' + encodeURIComponent(keyword);
      
      const page = await this.getPage();
      try {
        await page.goto(searchUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        
        // 等待结果加载
        await page.waitForTimeout(5000);
        
        const items = await page.evaluate(() => {
          const results = [];
          // 尝试多种可能的选择器
          const selectors = ['.searchItems', '.search-item', '[class*="product"]', 'article', '.item'];
          let elements = [];
          
          for (const sel of selectors) {
            elements = document.querySelectorAll(sel);
            if (elements.length > 0) break;
          }
          
          elements.forEach(el => {
            const link = el.querySelector('a[href*="p-"], a[href*="product"]');
            const nameEl = el.querySelector('span.item-name, .name, h4, h3');
            
            if (link && nameEl) {
              const title = nameEl.textContent.trim();
              const href = link.getAttribute('href');
              
              if (title && href) {
                results.push({
                  title: title,
                  url: href.startsWith('http') ? href : new URL(href, 'https://www.dormanproducts.com/').toString(),
                  price: '',
                  image: ''
                });
              }
            }
          });
          
          return results.slice(0, 12);
        });
        
        const result = {
          items,
          metaTitle: 'Dorman',
          source: 'Dorman'
        };
        
        cache.set(cacheKey, result);
        logger.info('Dorman search completed', { keyword, count: items.length });
        
        return result;
      } finally {
        await page.close();
      }
    }, { context: 'Dorman search' });
  }

  // AUTODOC: 搜索产品
  async searchAutodoc(keyword) {
    const cacheKey = `autodoc:search:${keyword}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    return retry(async () => {
      const searchUrl = 'https://www.autodoc.parts/search?keyword=' + encodeURIComponent(keyword);
      
      const page = await this.getPage();
      try {
        await page.goto(searchUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        
        // 等待结果加载
        await page.waitForTimeout(4000);
        
        const items = await page.evaluate(() => {
          const results = [];
          // 尝试多种选择器
          const selectors = [
            '[data-listing-products] .listing-item',
            '.listing-item',
            '.product-item',
            '[class*="product"]',
            'article'
          ];
          
          let elements = [];
          for (const sel of selectors) {
            elements = document.querySelectorAll(sel);
            if (elements.length > 0) break;
          }
          
          elements.forEach(el => {
            const link = el.querySelector('a[href*="/car-parts/"], a[class*="name"], a[class*="title"]');
            const nameEl = el.querySelector('[class*="name"], [class*="title"], h2, h3, h4');
            
            if (link && nameEl) {
              const name = nameEl.textContent.trim().replace(/\s+/g, ' ');
              const href = link.getAttribute('href');
              
              if (name && href) {
                results.push({
                  title: name,
                  url: href.startsWith('http') ? href : new URL(href, 'https://www.autodoc.parts/').toString(),
                  price: '',
                  image: ''
                });
              }
            }
          });
          
          return results.slice(0, 12);
        });
        
        const result = {
          items,
          metaTitle: 'AUTODOC',
          source: 'AUTODOC'
        };
        
        cache.set(cacheKey, result);
        logger.info('AUTODOC search completed', { keyword, count: items.length });
        
        return result;
      } finally {
        await page.close();
      }
    }, { context: 'AUTODOC search' });
  }

  // 关闭浏览器
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
      logger.info('Puppeteer browser closed');
    }
  }
}

module.exports = new ScraperService();
