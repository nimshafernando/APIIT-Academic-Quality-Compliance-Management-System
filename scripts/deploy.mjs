// Deploys the built frontend (dist/) to Appwrite Sites as a static SPA.
// Uses the Sites REST API directly (node-appwrite v14 predates Sites).
//
// Usage: npm run build && node scripts/deploy.mjs
import 'dotenv/config'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync, unlinkSync } from 'node:fs'

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env
const SITE_ID = 'aqcms'
const HEADERS = {
  'X-Appwrite-Project': APPWRITE_PROJECT_ID,
  'X-Appwrite-Key': APPWRITE_API_KEY,
}

async function api(method, path, body, isJson = true) {
  const res = await fetch(`${APPWRITE_ENDPOINT}${path}`, {
    method,
    headers: isJson && body ? { ...HEADERS, 'Content-Type': 'application/json' } : HEADERS,
    body: body ? (isJson ? JSON.stringify(body) : body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data.message || JSON.stringify(data)}`)
  return data
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 1) Ensure the site exists (static adapter, SPA fallback to index.html)
let site
try {
  site = await api('GET', `/sites/${SITE_ID}`)
  console.log('• site aqcms already exists')
} catch {
  site = await api('POST', '/sites', {
    siteId: SITE_ID,
    name: 'AQCMS — School of Computing',
    framework: 'other',
    adapter: 'static',
    fallbackFile: 'index.html',
    buildRuntime: 'node-22',
    installCommand: '',
    buildCommand: '',
    outputDirectory: './',
  })
  console.log('✔ site aqcms created')
}

// 2) Package the locally built dist/
if (!existsSync('dist/index.html')) {
  console.error('dist/ not found — run `npm run build` first.')
  process.exit(1)
}
execSync('tar -czf site.tar.gz -C dist .', { stdio: 'inherit' })
console.log('✔ packaged dist/ → site.tar.gz')

// 3) Upload + activate the deployment
const form = new FormData()
form.append('code', new Blob([readFileSync('site.tar.gz')], { type: 'application/gzip' }), 'code.tar.gz')
form.append('activate', 'true')
const deployment = await api('POST', `/sites/${SITE_ID}/deployments`, form, false)
unlinkSync('site.tar.gz')
console.log(`✔ deployment ${deployment.$id} uploaded — waiting for it to go live…`)

// 4) Poll until ready
for (let i = 0; i < 60; i++) {
  await sleep(5000)
  const d = await api('GET', `/sites/${SITE_ID}/deployments/${deployment.$id}`)
  if (d.status === 'ready') {
    // The multipart `activate` flag is not always honoured for subsequent
    // deployments — switch the site's active deployment explicitly.
    await api('PATCH', `/sites/${SITE_ID}/deployment`, { deploymentId: deployment.$id })
    console.log('✔ deployment is live and activated on the main domain (CDN cache may take ~1 min to refresh)')
    break
  }
  if (d.status === 'failed') {
    console.error('Deployment failed. Build logs:\n' + (d.buildLogs || '(none)'))
    process.exit(1)
  }
  console.log(`  … status: ${d.status}`)
}

// 5) Report the permanent site URL (trigger:"manual" = site-level rule that
//    always tracks the active deployment; trigger:"deployment" rules are
//    per-build preview domains pinned to one deployment forever).
try {
  const rules = await api('GET', '/proxy/rules')
  const siteDomains = (rules.rules || [])
    .filter((r) => r.deploymentResourceId === SITE_ID && r.trigger !== 'deployment')
    .map((r) => r.domain)
  if (siteDomains.length) console.log(`\n🌐 Live at: ${siteDomains.map((d) => `https://${d}`).join('\n           ')}`)
  else console.log('\nDeployed. Find the URL in Appwrite Console → Sites → aqcms (Domains tab).')
} catch {
  console.log('\nDeployed. Find the URL in Appwrite Console → Sites → aqcms (Domains tab).')
}
