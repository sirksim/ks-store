import { cpSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'dist')
let html = readFileSync(resolve(root, 'index.html'), 'utf8')
html = html.replaceAll('%BASE_URL%', '/admin/')
html = html.replace('<script type="module" src="/src/main.jsx"></script>', '<script type="module" src="/assets/main.js"></script>')
html = html.replace('</head>', '    <link rel="stylesheet" href="/assets/main.css" />\n  </head>')
if (html.includes('/src/main.jsx') || html.includes('%BASE_URL%')) throw new Error('HTML template was not finalized')
cpSync(resolve(root, 'public'), resolve(output, 'admin'), { recursive: true })
copyFileSync(resolve(root, 'public', 'social-preview.png'), resolve(output, 'social-preview.png'))
writeFileSync(resolve(output, 'admin', 'index.html'), html)
let catalogHtml = readFileSync(resolve(root, 'catalog.html'), 'utf8')
catalogHtml = catalogHtml.replace('<script type="module" src="/src/public.jsx"></script>',
  '<script type="module" src="/assets/public.js"></script>\n    <link rel="stylesheet" href="/assets/public.css" />')
if (catalogHtml.includes('/src/public.jsx')) throw new Error('Catalogue HTML template was not finalized')
writeFileSync(resolve(output, 'index.html'), catalogHtml)
writeFileSync(resolve(output, '_routes.json'), JSON.stringify({ version: 1, include: ['/*'],
  exclude: ['/assets/*', '/admin/icons/*', '/social-preview.png'] }))
