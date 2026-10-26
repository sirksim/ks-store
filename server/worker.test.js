import test from 'node:test'
import assert from 'node:assert/strict'
import worker from './worker.js'
import { mockD1 } from './d1Store.test.js'
import { cloneInitial } from '../src/data.js'

test('private Pages routes reject requests without a verified Access identity', async () => {
  for (const host of ['ks.sirksim.xyz', 'ks.pages.dev']) {
    for (const path of ['/admin/', '/admin/api/snapshot', '/admin/api/picture']) {
      const response = await worker.fetch(new Request(`https://${host}${path}`), {})
      assert.equal(response.status, 403)
    }
  }
})

test('picture upload validates the file and serves the stored image', async () => {
  const objects = new Map()
  const env = { ALLOW_LOCAL_AUTH: '1', DB: {}, IMAGES: {
    put: async (key, bytes, options) => { objects.set(key, { body: bytes, httpMetadata: options.httpMetadata }) },
    get: async key => objects.get(key),
  } }
  const endpoint = 'http://localhost/admin/api/picture'
  const bad = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: 'not a png' }), env)
  assert.equal(bad.status, 400)
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
  const upload = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: bytes }), env)
  assert.equal(upload.status, 200)
  const { picture } = await upload.json()
  const image = await worker.fetch(new Request(`http://localhost/images/${picture}`), env)
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('Content-Type'), 'image/png')
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), bytes)
})

test('Pages API starts empty, publishes a product, restores JSON and resets to empty', async () => {
  const db = mockD1()
  const objects = new Map()
  const env = { ALLOW_LOCAL_AUTH: '1', DB: db, ASSETS: { fetch: async () => new Response('site') },
    IMAGES: { put: async (key, bytes, options) => objects.set(key, { body: bytes, httpMetadata: options.httpMetadata }),
      get: async key => objects.get(key) } }
  const call = (path, method = 'GET', body, headers = {}) => worker.fetch(new Request(`http://localhost${path}`, {
    method, headers: { ...(body && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body instanceof Uint8Array ? body : body && JSON.stringify(body),
  }), env)
  try {
    assert.equal((await call('/')).status, 200)
    assert.deepEqual((await (await call('/api/catalog')).json()).products, [])
    const initial = await (await call('/admin/api/snapshot')).json()
    assert.deepEqual(initial.state, cloneInitial())
    const change = async (kind, id, payload, baseRevision = 0) => call('/admin/api/change', 'POST',
      { opId: crypto.randomUUID(), kind, id, payload, baseRevision })
    assert.equal((await change('families', 'family-1', { id: 'family-1', name: 'Test', category: 'Boisson', volume: '75 cl' })).status, 200)
    const image = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
    const upload = await (await call('/admin/api/picture', 'POST', image, { 'Content-Type': 'image/png' })).json()
    const product = { code: 'TEST-1', familyId: 'family-1', variant: 'Rouge', unitsPerCase: 6,
      margin: null, picture: upload.picture, published: false }
    assert.equal((await change('products', product.code, product)).status, 200)
    assert.deepEqual((await (await call('/api/catalog')).json()).products, [])
    assert.equal((await change('products', product.code, { ...product, published: true }, 1)).status, 200)
    assert.equal((await (await call('/api/catalog')).json()).products.length, 1)
    assert.equal((await call(upload.url)).status, 200)
    const snapshot = await (await call('/admin/api/snapshot')).json()
    assert.equal(snapshot.state.products.length, 1)
    assert.equal((await call('/admin/api/replace', 'POST', snapshot.state)).status, 200)
    assert.equal((await (await call('/admin/api/snapshot')).json()).state.products.length, 1)
    assert.equal((await call('/admin/api/replace', 'POST', { ...snapshot.state, receipts: [] })).status, 400)
    assert.equal((await call('/admin/api/replace', 'POST', cloneInitial())).status, 200)
    assert.deepEqual((await (await call('/api/catalog')).json()).products, [])
  } finally { db.close() }
})
