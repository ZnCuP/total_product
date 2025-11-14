const express = require('express')
const path = require('path')
const fetch = require('node-fetch')
const cheerio = require('cheerio')
const sanitizeHtml = require('sanitize-html')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))

function normalizeUrl(u) {
  try {
    const url = new URL(u)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

function pickContent($) {
  const candidates = [
    'article',
    'main',
    '#content',
    '.content',
    '#main',
    '.main',
    '#container',
    '.post',
    '.entry',
  ]
  for (const sel of candidates) {
    const el = $(sel).first()
    if (el && el.length && el.html()) return el
  }
  return $('body')
}

function sanitize(html) {
  return sanitizeHtml(html, {
    allowedTags: [
      'h1','h2','h3','h4','h5','h6','p','div','span','ul','ol','li','a','img','blockquote','pre','code','table','thead','tbody','tr','th','td','hr','br','strong','em','small'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      '*': ['class']
    },
    allowedSchemes: ['http', 'https', 'data'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' })
    }
  })
}

function extractMeta($) {
  const title = $('title').first().text() || ''
  const desc = $('meta[name="description"]').attr('content') || ''
  const ogTitle = $('meta[property="og:title"]').attr('content') || ''
  const ogDesc = $('meta[property="og:description"]').attr('content') || ''
  return { title: title || ogTitle, description: desc || ogDesc }
}

function basicStats($, contentEl) {
  const text = contentEl.text().trim()
  const words = text.split(/\s+/).filter(Boolean)
  const links = contentEl.find('a').length
  const images = contentEl.find('img').length
  const headings = contentEl.find('h1,h2,h3,h4,h5,h6').length
  return {
    textLength: text.length,
    wordCount: words.length,
    linkCount: links,
    imageCount: images,
    headingCount: headings
  }
}

function extractKeywords(text) {
  const lower = text.toLowerCase()
  const enTokens = (lower.match(/\b[a-z]{3,}\b/g) || []).filter(t => !EN_STOP.has(t))
  const zhTokens = (text.match(/[\u4e00-\u9fa5]{2,}/g) || [])
  const freq = new Map()
  for (const t of [...enTokens, ...zhTokens]) {
    freq.set(t, (freq.get(t) || 0) + 1)
  }
  const top = [...freq.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10).map(([k,v]) => k)
  return top
}

const EN_STOP = new Set([
  'the','and','for','are','with','this','that','from','have','will','your','you','but','not','all','can','was','what','when','where','which','into','about','more','over','than','also','just','like','then','they','them','their','been','were','there','here'
])

function toAbsolute(href, base) {
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

function extractItems($, contentEl, baseUrl) {
  const set = new Set()
  const items = []
  contentEl.find('a').each((_, el) => {
    const text = $(el).text().trim()
    const href = $(el).attr('href') || ''
    if (!href || text.length < 4) return
    const abs = toAbsolute(href, baseUrl)
    if (!abs || set.has(abs)) return
    set.add(abs)
    items.push({ title: text.slice(0, 120), url: abs })
  })
  return items.slice(0, 12)
}

function isAPremium(u) {
  try {
    const h = new URL(u).hostname
    return h === 'a-premium.com' || h.endsWith('.a-premium.com')
  } catch {
    return false
  }
}

function isSixity(u) {
  try {
    const h = new URL(u).hostname
    return h === 'www.sixityauto.com' || h === 'sixityauto.com'
  } catch {
    return false
  }
}

function isDorman(u) {
  try {
    const h = new URL(u).hostname
    return h === 'www.dormanproducts.com' || h === 'dormanproducts.com'
  } catch {
    return false
  }
}

function isAutodoc(u) {
  try {
    const h = new URL(u).hostname
    return h === 'www.autodoc.parts' || h === 'autodoc.parts'
  } catch {
    return false
  }
}

async function fetchAPremiumBuildId() {
  const resp = await fetch('https://a-premium.com/_next/static/BUILD_ID', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
      'Accept': 'text/plain',
      'Referer': 'https://a-premium.com/categories?keyword='
    },
    redirect: 'follow'
  })
  if (!resp.ok) throw new Error('BUILD_ID fetch failed')
  const text = await resp.text()
  const id = (text || '').trim()
  if (!id) throw new Error('Empty BUILD_ID')
  return id
}

async function fetchAPremiumSearch(keyword) {
  const buildId = await fetchAPremiumBuildId()
  const apiUrl = `https://a-premium.com/_next/data/${buildId}/search.json?keyword=${encodeURIComponent(keyword)}`
  const resp = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
      'Accept': 'application/json',
      'Referer': 'https://a-premium.com/categories?keyword='
    },
    redirect: 'follow'
  })
  if (!resp.ok) throw new Error('Search API failed')
  const json = await resp.json()
  const pageProps = json.pageProps || {}
  const list = (((pageProps.filterData || {}).itemList || {}).data) || []
  const items = list.map(it => ({
    title: it.title || it.seoTitle || it.subTitle || it.rwTitle || '',
    url: `https://a-premium.com/product/${it.urlHandle}`
  })).slice(0, 12)
  const meta = pageProps.globalSeoData || {}
  return { items, metaTitle: meta.title || '' }
}

async function fetchSixitySearch(keyword) {
  const domain = 'https://www.sixityauto.com/search?q=' + encodeURIComponent(keyword)
  const apiUrl = 'https://hzbon8.a.searchspring.io/api/search/search.json?ajaxCatalog=v3&resultsFormat=native&siteId=hzbon8&domain=' + encodeURIComponent(domain) + '&q=' + encodeURIComponent(keyword) + '&noBeacon=true'
  const resp = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
      'Accept': 'application/json',
      'Origin': 'https://www.sixityauto.com',
      'Referer': 'https://www.sixityauto.com/'
    },
    redirect: 'follow'
  })
  if (!resp.ok) throw new Error('Sixity API failed')
  const json = await resp.json()
  const results = Array.isArray(json.results) ? json.results : []
  const items = results.map(r => ({
    title: r.name || '',
    url: r.url || ''
  })).slice(0, 12)
  return { items }
}

async function fetchDormanSearch(keyword) {
  const searchUrl = 'https://www.dormanproducts.com/gsearch.aspx?type=keyword&origin=keyword&q=' + encodeURIComponent(keyword)
  const resp = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Referer': 'https://www.dormanproducts.com/gsearch.aspx?type=keyword&origin=keyword'
    },
    redirect: 'follow'
  })
  if (!resp.ok) throw new Error('Dorman search failed')
  const html = await resp.text()
  const $ = cheerio.load(html)
  const items = []
  $('.searchItems').each((_, el) => {
    const $el = $(el)
    const href = $el.find('a[href^="p-"]').first().attr('href') || ''
    const name = $el.find('span.item-name').first().text().trim()
    const h4 = $el.find('h4').first().text().trim()
    const title = (name ? name : '') + (h4 ? ' — ' + h4 : '')
    const abs = href ? toAbsolute(href, 'https://www.dormanproducts.com/') : null
    if (abs) items.push({ title: title || h4 || name || 'Item', url: abs })
  })
  return { items: items.slice(0, 12) }
}

async function fetchAutodocSearch(keyword) {
  const searchUrl = 'https://www.autodoc.parts/search?keyword=' + encodeURIComponent(keyword)
  const resp = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Referer': 'https://www.autodoc.parts/'
    },
    redirect: 'follow'
  })
  if (!resp.ok) throw new Error('Autodoc search failed')
  const html = await resp.text()
  const $ = cheerio.load(html)
  const items = []
  $('[data-listing-products] .listing-item').each((_, el) => {
    const $el = $(el)
    const href = $el.find('a.listing-item__name').attr('href') || $el.find('a.listing-item__image-product').attr('href') || ''
    const name = $el.find('a.listing-item__name').text().trim().replace(/\s+/g, ' ')
    const abs = href ? toAbsolute(href, 'https://www.autodoc.parts/') : null
    if (abs && name) items.push({ title: name, url: abs })
  })
  return { items: items.slice(0, 12) }
}

async function fallbackAPremiumHTML(keyword) {
  const resp = await fetch('https://a-premium.com/categories?keyword=' + encodeURIComponent(keyword), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    redirect: 'follow'
  })
  if (!resp.ok) throw new Error('Fallback HTML failed')
  const html = await resp.text()
  const $ = cheerio.load(html)
  $('script,style,noscript,iframe').remove()
  const items = []
  $('a[href*="/product/"]').each((_, el) => {
    const t = $(el).text().trim()
    const href = $(el).attr('href') || ''
    const abs = toAbsolute(href, 'https://a-premium.com/')
    if (abs && t.length > 6) items.push({ title: t.slice(0, 120), url: abs })
  })
  const meta = extractMeta($)
  return { items: items.slice(0, 12), metaTitle: meta.title || '' }
}

app.get('/api/fetch', async (req, res) => {
  const raw = req.query.url || ''
  const url = normalizeUrl(raw)
  if (!url) return res.status(400).json({ error: '无效的URL' })
  try {
    const keyword = (req.query.keyword || '').trim()
    if (isAPremium(url) && keyword) {
      try {
        const { items, metaTitle } = await fetchAPremiumSearch(keyword)
        return res.json({ url, meta: { title: metaTitle, description: '' }, html: '', stats: { itemCount: items.length }, analysis: { keywords: [keyword] }, items })
      } catch (e1) {
        try {
          const { items, metaTitle } = await fallbackAPremiumHTML(keyword)
          return res.json({ url, meta: { title: metaTitle, description: '' }, html: '', stats: { itemCount: items.length }, analysis: { keywords: [keyword] }, items })
        } catch (e2) {
          return res.status(502).json({ error: '目标接口不可用' })
        }
      }
    }
    if (isSixity(url) && keyword) {
      try {
        const { items } = await fetchSixitySearch(keyword)
        return res.json({ url, meta: { title: 'Sixity Auto', description: '' }, html: '', stats: { itemCount: items.length }, analysis: { keywords: [keyword] }, items })
      } catch (e3) {
        return res.status(502).json({ error: '目标接口不可用' })
      }
    }
    if (isDorman(url) && keyword) {
      try {
        const { items } = await fetchDormanSearch(keyword)
        return res.json({ url, meta: { title: 'Dorman Products', description: '' }, html: '', stats: { itemCount: items.length }, analysis: { keywords: [keyword] }, items })
      } catch (e4) {
        return res.status(502).json({ error: '目标接口不可用' })
      }
    }
    if (isAutodoc(url) && keyword) {
      try {
        const { items } = await fetchAutodocSearch(keyword)
        return res.json({ url, meta: { title: 'AUTODOC', description: '' }, html: '', stats: { itemCount: items.length }, analysis: { keywords: [keyword] }, items })
      } catch (e5) {
        return res.status(502).json({ error: '目标接口不可用' })
      }
    }
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow'
    })
    if (!resp.ok) return res.status(resp.status).json({ error: '抓取失败', status: resp.status })
    const html = await resp.text()
    const $ = cheerio.load(html)
    $('script,style,noscript,iframe').remove()
    const meta = extractMeta($)
    const contentEl = pickContent($)
    const cleanHtml = sanitize(contentEl.html() || '')
    const stats = basicStats($, contentEl)
    const keywords = extractKeywords(contentEl.text())
    const items = extractItems($, contentEl, url)
    return res.json({ url, meta, html: cleanHtml, stats, analysis: { keywords }, items })
  } catch (e) {
    return res.status(500).json({ error: '服务端异常' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`)
})
