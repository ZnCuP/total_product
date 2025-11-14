// 前端应用逻辑
const sites = [
  { id:'a-premium', name:'A‑Premium', url:'https://a-premium.com/', category:'汽车配件' },
  { id:'sixity', name:'Sixity Auto', url:'https://www.sixityauto.com/', category:'汽车配件' },
  { id:'dorman', name:'Dorman Products', url:'https://www.dormanproducts.com/', category:'汽车配件' },
  { id:'autodoc', name:'AUTODOC', url:'https://www.autodoc.parts/', category:'汽车配件' }
]

const keywords = [
  { en:'Oil Level Sensor', zh:'机油液位传感器', slug: 'oil-level-sensor' },
  { en:'Diesel Glow Plug Controller', zh:'预热控制模块', slug: 'diesel-glow-plug-controller' },
  { en:'Steering Angle sensor', zh:'方向盘转角传感器', slug: 'steering-angle-sensor' },
  { en:'MAP Sensor', zh:'压力传感器', slug: 'map-sensor' },
  { en:'Exhaust Gas PDF Differential Pressure Sensor', zh:'排气压力传感器/压差传感器', slug: 'exhaust-gas-pdf-differential-pressure-sensor' },
  { en:'EGTS Sensor', zh:'尾气温度传感器', slug: 'egts-sensor' },
  { en:'Ride Height Level Sensor', zh:'水平高度传感器', slug: 'ride-height-level-sensor' },
  { en:'air flow meter', zh:'空气流量传感器', slug: 'air-flow-meter' },
  { en:'Oxygen Sensor', zh:'氧传感器', slug: 'oxygen-sensor' },
  { en:'Throttle Position Sensor', zh:'节气门位置传感器', slug: 'throttle-position-sensor' },
  { en:'Knock Sensor', zh:'爆震传感器', slug: 'knock-sensor' },
  { en:'clock spring', zh:'气囊游丝', slug: 'clock-spring' },
  { en:'Ignition Coils', zh:'点火线圈', slug: 'ignition-coils' },
  { en:'Windshield Fluid Washer Pump', zh:'清洗泵', slug: 'windshield-fluid-washer-pump' },
]

// DOM元素
const infoEl = document.getElementById('info')
const gridEl = document.getElementById('grid')
const sitesEl = document.getElementById('sites')
const keywordInput = document.getElementById('keyword')
const kwlistEl = document.getElementById('kwlist')
const autoCb = document.getElementById('auto')
const loadingEl = document.getElementById('loading')
const clearCacheBtn = document.getElementById('clearCache')

// 状态
let currentSite = null
let currentKeyword = ''
let currentKeywordZh = ''
let timer = null
let isLoading = false

// 显示/隐藏加载动画
function showLoading(show = true) {
  isLoading = show
  loadingEl.style.display = show ? 'flex' : 'none'
}

// 显示错误信息
function showError(message) {
  infoEl.innerHTML = `<div class="error">❌ ${message}</div>`
  gridEl.innerHTML = ''
  showLoading(false)
}

// 显示成功信息
function showSuccess(site, keyword, keywordZh, data) {
  const kwDisplay = keyword ? `${keyword}${keywordZh ? ' — ' + keywordZh : ''}` : '未选择关键词'
  const updateTime = data.updatedAt ? new Date(data.updatedAt).toLocaleString('zh-CN') : '未知'
  const totalCount = data.totalCount || data.items.length
  
  infoEl.innerHTML = `
    <div class="info-row">
      <strong>站点:</strong> ${site.name}
      <span class="cache-badge">📦 离线数据</span>
    </div>
    <div class="info-row">
      <strong>关键词:</strong> ${kwDisplay}
    </div>
    <div class="info-row">
      <strong>结果数:</strong> ${data.items.length} / ${totalCount} 个产品
    </div>
    <div class="info-row">
      <strong>更新时间:</strong> ${updateTime}
    </div>
  `
}

// 渲染关键词列表
function renderKeywords() {
  kwlistEl.innerHTML = keywords.map(k => 
    `<option value="${k.en}" label="${k.en} -- ${k.zh}"></option>`
  ).join('')
}

// 渲染站点按钮
function renderSiteButtons() {
  sitesEl.innerHTML = sites.map(s => 
    `<button class="site-btn" data-id="${s.id}" ${isLoading ? 'disabled' : ''}>${s.name}</button>`
  ).join('')
  
  sitesEl.querySelectorAll('.site-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isLoading) return
      const id = btn.getAttribute('data-id')
      const site = sites.find(x => x.id === id)
      if (site) loadSite(site)
    })
  })
}

// 加载站点数据
async function loadSite(site) {
  if (!currentKeyword) {
    showError('请先输入关键词')
    return
  }

  currentSite = site
  if (timer) {
    clearInterval(timer)
    timer = null
  }

  await fetchAndRender(site)
  
  if (autoCb.checked) {
    timer = setInterval(() => fetchAndRender(site), 30000)
  }
}

// 抓取并渲染数据
async function fetchAndRender(site) {
  showLoading(true)
  gridEl.innerHTML = ''
  
  try {
    // 查找关键词配置，获取slug
    const keywordConfig = keywords.find(k => k.en.toLowerCase() === currentKeyword.toLowerCase())
    if (!keywordConfig) {
      throw new Error('未找到关键词配置')
    }

    // 调用新的 /api/data 接口
    const url = `/api/data?site=${site.id}&keyword=${encodeURIComponent(keywordConfig.slug)}`
    
    const res = await fetch(url)
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: '未知错误' }))
      throw new Error(errorData.error || errorData.message || '读取数据失败')
    }
    
    const data = await res.json()
    
    showSuccess(site, currentKeyword, currentKeywordZh, data)
    
    const items = data.items || []
    
    if (items.length === 0) {
      gridEl.innerHTML = '<div class="no-results">😕 该品类数据尚未采集，请运行数据采集脚本</div>'
    } else {
      const cards = items.map(item => `
        <article class="card">
          ${item.image ? `<div class="card-image"><img src="${item.image}" alt="${item.title}" loading="lazy"></div>` : ''}
          <div class="card-content">
            <h3 class="card-title">
              <a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>
            </h3>
            ${item.price ? `<div class="card-price">${item.price}</div>` : ''}
          </div>
        </article>
      `)
      gridEl.innerHTML = cards.join('')
    }
    
    showLoading(false)
  } catch (error) {
    console.error('Fetch error:', error)
    showError(error.message || '读取数据失败，请稍后重试')
  }
}

// 清除缓存（现在改为刷新数据列表）
async function clearCache() {
  try {
    showLoading(true)
    const res = await fetch('/api/data/list')
    
    if (res.ok) {
      const data = await res.json()
      console.log('可用数据列表:', data)
      
      let message = '📊 数据统计:\n\n'
      for (const [siteId, siteData] of Object.entries(data.sites)) {
        message += `${siteData.name}: ${siteData.count}/${data.totalKeywords} 个品类\n`
      }
      
      alert(message)
      showLoading(false)
    } else {
      throw new Error('获取数据列表失败')
    }
  } catch (error) {
    alert('❌ ' + error.message)
    showLoading(false)
  }
}

// 事件监听
keywordInput.addEventListener('input', () => {
  const val = keywordInput.value.trim()
  currentKeyword = val
  const found = keywords.find(k => k.en.toLowerCase() === val.toLowerCase())
  currentKeywordZh = found ? found.zh : ''
})

keywordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && currentSite && currentKeyword) {
    loadSite(currentSite)
  }
})

// 自动刷新功能保留（但现在刷新的是本地数据，意义不大，可以考虑去掉）
autoCb.addEventListener('change', () => {
  if (autoCb.checked && currentSite) {
    timer = setInterval(() => fetchAndRender(currentSite), 30000)
  } else if (timer) {
    clearInterval(timer)
    timer = null
  }
})

clearCacheBtn.addEventListener('click', clearCache)

// 修改按钮文字
clearCacheBtn.textContent = '数据统计'

// 初始化
renderKeywords()
renderSiteButtons()

// 页面卸载时清理定时器
window.addEventListener('beforeunload', () => {
  if (timer) clearInterval(timer)
})
