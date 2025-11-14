// API路由
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const scraperService = require('../services/ScraperService');
const logger = require('../utils/logger');

// 关键词列表配置
const KEYWORDS = [
  { en: 'Oil Level Sensor', zh: '机油液位传感器', slug: 'oil-level-sensor' },
  { en: 'Diesel Glow Plug Controller', zh: '预热控制模块', slug: 'diesel-glow-plug-controller' },
  { en: 'Steering Angle sensor', zh: '方向盘转角传感器', slug: 'steering-angle-sensor' },
  { en: 'MAP Sensor', zh: '压力传感器', slug: 'map-sensor' },
  { en: 'Exhaust Gas PDF Differential Pressure Sensor', zh: '排气压力传感器/压差传感器', slug: 'exhaust-gas-pdf-differential-pressure-sensor' },
  { en: 'EGTS Sensor', zh: '尾气温度传感器', slug: 'egts-sensor' },
  { en: 'Ride Height Level Sensor', zh: '水平高度传感器', slug: 'ride-height-level-sensor' },
  { en: 'air flow meter', zh: '空气流量传感器', slug: 'air-flow-meter' },
  { en: 'Oxygen Sensor', zh: '氧传感器', slug: 'oxygen-sensor' },
  { en: 'Throttle Position Sensor', zh: '节气门位置传感器', slug: 'throttle-position-sensor' },
  { en: 'Knock Sensor', zh: '爆震传感器', slug: 'knock-sensor' },
  { en: 'clock spring', zh: '气囊游丝', slug: 'clock-spring' },
  { en: 'Ignition Coils', zh: '点火线圈', slug: 'ignition-coils' },
  { en: 'Windshield Fluid Washer Pump', zh: '清洗泵', slug: 'windshield-fluid-washer-pump' }
];

const SITES = [
  { id: 'a-premium', name: 'A-Premium', folder: 'a-premium' },
  { id: 'sixity', name: 'Sixity Auto', folder: 'sixity-auto' },
  { id: 'dorman', name: 'Dorman Products', folder: 'dorman' },
  { id: 'autodoc', name: 'AUTODOC', folder: 'autodoc' }
];

// 获取本地JSON数据
router.get('/data', async (req, res) => {
  const { site, keyword } = req.query;

  if (!site || !keyword) {
    return res.status(400).json({ error: '缺少site或keyword参数' });
  }

  try {
    // 查找对应的站点和关键词配置
    const siteConfig = SITES.find(s => s.id === site);
    const keywordConfig = KEYWORDS.find(k => k.en.toLowerCase() === keyword.toLowerCase() || k.slug === keyword);

    if (!siteConfig) {
      return res.status(404).json({ error: '站点不存在' });
    }

    if (!keywordConfig) {
      return res.status(404).json({ error: '关键词不存在' });
    }

    // 构建文件路径
    const filePath = path.join(__dirname, '../../data', siteConfig.folder, `${keywordConfig.slug}.json`);
    
    // 读取JSON文件
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    logger.info('Loaded data from file', { site, keyword, itemCount: data.items?.length || 0 });

    return res.json(data);

  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn('Data file not found', { site, keyword });
      return res.status(404).json({ 
        error: '数据文件不存在',
        message: '该品类数据尚未采集，请运行数据采集脚本'
      });
    }

    logger.error('Failed to load data', { site, keyword, error: error.message });
    return res.status(500).json({ error: '读取数据失败' });
  }
});

// 获取所有可用的数据列表
router.get('/data/list', async (req, res) => {
  try {
    const dataDir = path.join(__dirname, '../../data');
    const result = {};

    for (const site of SITES) {
      const siteDir = path.join(dataDir, site.folder);
      try {
        const files = await fs.readdir(siteDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        result[site.id] = {
          name: site.name,
          availableKeywords: jsonFiles.map(f => f.replace('.json', '')),
          count: jsonFiles.length
        };
      } catch (err) {
        result[site.id] = {
          name: site.name,
          availableKeywords: [],
          count: 0
        };
      }
    }

    return res.json({
      sites: result,
      totalKeywords: KEYWORDS.length,
      keywords: KEYWORDS
    });

  } catch (error) {
    logger.error('Failed to list data', { error: error.message });
    return res.status(500).json({ error: '获取数据列表失败' });
  }
});

// 保留旧的实时抓取接口（用于测试）
router.get('/fetch', async (req, res) => {
  const { url, keyword } = req.query;

  if (!url) {
    return res.status(400).json({ error: '缺少URL参数' });
  }

  if (!keyword) {
    return res.status(400).json({ error: '缺少keyword参数' });
  }

  try {
    const hostname = new URL(url).hostname;
    let result = null;

    logger.info('Fetching data', { hostname, keyword });

    // 根据域名选择对应的爬虫方法
    if (hostname.includes('a-premium.com')) {
      result = await scraperService.searchAPremium(keyword);
    } else if (hostname.includes('sixityauto.com')) {
      result = await scraperService.searchSixity(keyword);
    } else if (hostname.includes('dormanproducts.com')) {
      result = await scraperService.searchDorman(keyword);
    } else if (hostname.includes('autodoc.parts')) {
      result = await scraperService.searchAutodoc(keyword);
    } else {
      return res.status(400).json({ error: '不支持的网站' });
    }

    // 统一返回格式
    return res.json({
      url,
      keyword,
      meta: {
        title: result.metaTitle || '',
        description: ''
      },
      html: '',
      stats: {
        itemCount: result.items.length
      },
      analysis: {
        keywords: [keyword]
      },
      items: result.items,
      source: result.source,
      cached: result.cached || false
    });

  } catch (error) {
    logger.error('Fetch failed', { 
      url, 
      keyword, 
      error: error.message,
      stack: error.stack 
    });
    
    return res.status(500).json({ 
      error: '抓取失败',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 清除缓存
router.post('/cache/clear', (req, res) => {
  try {
    const cache = require('../utils/cache');
    cache.clear();
    logger.info('Cache cleared via API');
    res.json({ success: true, message: '缓存已清除' });
  } catch (error) {
    logger.error('Failed to clear cache', { error: error.message });
    res.status(500).json({ error: '清除缓存失败' });
  }
});

// 健康检查
router.get('/health', (req, res) => {
  const cache = require('../utils/cache');
  res.json({
    status: 'ok',
    cache: {
      size: cache.size(),
      maxSize: require('../config').cache.maxSize
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
