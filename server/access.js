let keysCache = { until: 0, keys: [] }

const decode = part => {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

export async function authorized(request, env) {
  const hostname = new URL(request.url).hostname
  if (env.ALLOW_LOCAL_AUTH === '1' && ['localhost', '127.0.0.1'].includes(hostname)) return true
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false
  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const header = decode(parts[0])
    const claims = decode(parts[1])
    const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team) || header.alg !== 'RS256' ||
      claims.type !== 'app' || !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD) || claims.iss !== `https://${team}` ||
      !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000 ||
      !Number.isFinite(claims.iat) || claims.iat > Date.now() / 1000 + 60 ||
      (claims.nbf != null && claims.nbf > Date.now() / 1000 + 60)) return false
    if (keysCache.until < Date.now()) {
      const response = await fetch(`https://${team}/cdn-cgi/access/certs`)
      if (!response.ok) return false
      const body = await response.json()
      keysCache = { until: Date.now() + 300_000, keys: body.keys || [] }
    }
    const jwk = keysCache.keys.find(key => key.kid === header.kid && key.kty === 'RSA')
    if (!jwk) return false
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const signature = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
  } catch { return false }
}
