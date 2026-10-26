import { createD1Store } from './d1Store.js'
import { authorized } from './access.js'
import { renderDocument } from './documentHtml.js'

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
const errorResponse = error => json({ error: error.status ? error.message : 'Erreur du serveur.' }, error.status || 500)
const bad = (message, status = 400) => Object.assign(new Error(message), { status })
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('')
const bodyJson = async request => {
  if (Number(request.headers.get('content-length')) > 20_000_000) throw bad('Fichier trop volumineux.', 413)
  const text = await request.text()
  if (text.length > 20_000_000) throw bad('Fichier trop volumineux.', 413)
  try { return JSON.parse(text) } catch { throw bad('JSON invalide.') }
}

async function adminApi(request, url, env, store) {
  const path = url.pathname.slice('/admin/api'.length)
  if (request.method === 'GET' && path === '/health') return json({ ok: true })
  if (request.method === 'GET' && path === '/snapshot') return json(await store.snapshot())
  if (request.method === 'GET' && path === '/changes')
    return json(await store.changesSince(Number(url.searchParams.get('after')) || 0, url.searchParams.get('epoch')))
  if (request.method === 'POST' && path === '/replace') return json(await store.replace(await bodyJson(request)))
  if (request.method === 'POST' && path === '/change') {
    const result = await store.apply(await bodyJson(request))
    return json(result, result.conflict ? 409 : 200)
  }
  if (path === '/share' && request.method === 'POST') {
    const { kind, id } = await bodyJson(request)
    const token = [...crypto.getRandomValues(new Uint8Array(32))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('')
    await store.createShare(kind, id, await hash(token))
    return json({ url: `${url.origin}/share/${token}` })
  }
  if (path === '/share' && request.method === 'GET')
    return json({ active: await store.shareStatus(url.searchParams.get('kind'), url.searchParams.get('id')) })
  if (path === '/share' && request.method === 'DELETE') {
    await store.revokeShare(url.searchParams.get('kind'), url.searchParams.get('id'))
    return json({ active: false })
  }
  if (path === '/picture' && request.method === 'POST') {
    if (!env.IMAGES) throw bad('Stockage des images non configuré.', 503)
    const mime = request.headers.get('content-type')?.split(';')[0].toLowerCase()
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    if (!extensions[mime]) throw bad('Format image non accepté.')
    const bytes = new Uint8Array(await request.arrayBuffer())
    if (!bytes.length || bytes.length > 5_000_000) throw bad('Image limitée à 5 Mo.', 413)
    const valid = mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
        : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    if (!valid) throw bad('Fichier image invalide.')
    const key = `${crypto.randomUUID()}.${extensions[mime]}`
    await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: mime } })
    return json({ picture: key, url: `/images/${key}` })
  }
  return json({ error: 'Introuvable.' }, 404)
}

async function serveAsset(env, request, pathname) {
  const target = new URL(pathname, request.url)
  return env.ASSETS.fetch(new Request(target, request))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      if (path === '/api/catalog' && request.method === 'GET') {
        if (!env.DB) throw bad('Base D1 non configurée.', 503)
        return json({ products: await createD1Store(env.DB).publicCatalog() })
      }
      if (path.startsWith('/images/') && request.method === 'GET') {
        if (!env.IMAGES) throw bad('Stockage des images non configuré.', 503)
        const key = path.slice('/images/'.length)
        if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) return json({ error: 'Introuvable.' }, 404)
        const object = await env.IMAGES.get(key)
        if (!object) return json({ error: 'Introuvable.' }, 404)
        return new Response(object.body, { headers: {
          'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
        } })
      }
      const shareMatch = request.method === 'GET' && /^\/share\/([A-Za-z0-9_-]+)$/.exec(path)
      if (shareMatch) {
        if (!env.DB) throw bad('Base D1 non configurée.', 503)
        const shared = await createD1Store(env.DB).sharedDocument(await hash(shareMatch[1]))
        if (!shared) return json({ error: 'Document introuvable.' }, 404)
        return new Response(renderDocument(shared), { headers: {
          'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        } })
      }
      if (path === '/admin' || path.startsWith('/admin/')) {
        if (!await authorized(request, env)) return json({ error: 'Accès refusé.' }, 403)
        if (path.startsWith('/admin/api/')) {
          if (!env.DB) throw bad('Base D1 non configurée.', 503)
          return await adminApi(request, url, env, createD1Store(env.DB))
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Méthode non autorisée.' }, 405)
        if (path === '/admin/manifest.webmanifest' || path === '/admin/sw.js' || path.startsWith('/admin/icons/'))
          return serveAsset(env, request, path)
        return serveAsset(env, request, '/admin/')
      }
      if (path === '/' || path === '/index.html') return serveAsset(env, request, '/')
      return env.ASSETS.fetch(request)
    } catch (error) { return errorResponse(error) }
  },
}
