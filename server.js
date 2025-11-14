const express = require('express')
const path = require('path')
const config = require('./src/config')
const logger = require('./src/utils/logger')
const apiRoutes = require('./src/routes/api')
const scraperService = require('./src/services/ScraperService')

const app = express()
const PORT = config.port

// 中间件
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))

// 请求日志
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { 
    query: req.query,
    ip: req.ip 
  })
  next()
})

// API路由
app.use('/api', apiRoutes)

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing gracefully')
  await scraperService.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing gracefully')
  await scraperService.close()
  process.exit(0)
})

app.listen(PORT, () => {
  logger.info(`Server running at http://localhost:${PORT}/`)
  logger.info('Environment:', { 
    nodeEnv: process.env.NODE_ENV || 'development',
    cacheMaxSize: config.cache.maxSize,
    cacheTTL: `${config.cache.ttl / 1000}s`
  })
})
