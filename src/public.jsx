import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Grid2X2, List, Search, SlidersHorizontal, PackageOpen, ArrowUp } from 'lucide-react'
import './public.css'

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')

function ProductImage({ product }) {
  const [failed, setFailed] = useState(false)
  return product.picture && !failed
    ? <img src={`/images/${product.picture}`} alt={product.name} loading="lazy" onError={() => setFailed(true)}/>
    : <div className="catalog-placeholder" aria-label="Photo indisponible"><PackageOpen size={42} strokeWidth={1.3}/><span>KS</span></div>
}

function StockBadge({ available }) {
  return <span className={`stock-badge ${available ? 'available' : 'unavailable'}`}><i aria-hidden="true"/>{available ? 'In stock' : 'Out of stock'}</span>
}

function App() {
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [stock, setStock] = useState('all')
  const [view, setView] = useState(() => localStorage.getItem('ks-catalog-view') === 'table' ? 'table' : 'cards')
  const [showBackToTop, setShowBackToTop] = useState(false)
  const load = async () => {
    setStatus('loading')
    try {
      const response = await fetch('/api/catalog', { cache: 'no-store' })
      if (!response.ok) throw new Error('Catalogue indisponible')
      const body = await response.json()
      setProducts(body.products || [])
      setStatus('ready')
    } catch { setStatus('error') }
  }
  useEffect(() => {
    load()
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(registrations => registrations
      .filter(registration => registration.scope === `${location.origin}/` && registration.active?.scriptURL.endsWith('/sw.js'))
      .forEach(registration => registration.unregister())).catch(() => {})
  }, [])
  useEffect(() => {
    const updateBackToTop = () => setShowBackToTop(window.scrollY > 300)
    updateBackToTop()
    window.addEventListener('scroll', updateBackToTop, { passive: true })
    return () => window.removeEventListener('scroll', updateBackToTop)
  }, [])
  const categories = useMemo(() => [...new Set(products.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [products])
  const visible = useMemo(() => products.filter(item => {
    const matchesText = !query || normalize(`${item.name} ${item.code} ${item.category} ${item.volume}`).includes(normalize(query))
    return matchesText && (category === 'all' || item.category === category) &&
      (stock === 'all' || (stock === 'available') === item.available)
  }), [products, query, category, stock])
  const setViewMode = mode => { setView(mode); localStorage.setItem('ks-catalog-view', mode) }
  return <div className="public-site">
    <header className="site-header"><div className="site-header-inner"><a className="brand" href="/" aria-label="KS, accueil"><span className="brand-symbol" aria-hidden="true">KS</span><strong>KS</strong></a><span className="header-caption">Notre catalogue</span></div></header>
    <main>
      <section className="catalog" aria-labelledby="catalog-title"><div className="section-heading"><div><span className="eyebrow">LA SÉLECTION</span><h1 id="catalog-title">Catalogue des produits</h1><p>Recherchez un produit ou affinez la sélection.</p></div><div className="result-count" aria-live="polite">{status === 'ready' ? `${visible.length} produit${visible.length > 1 ? 's' : ''}` : '—'}</div></div>
        <div className="toolbar"><label className="search-field"><Search size={19}/><span className="sr-only">Rechercher un produit</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nom ou code produit…" type="search"/></label><div className="filters"><span className="filter-icon"><SlidersHorizontal size={17}/></span><label><span className="sr-only">Catégorie</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">Toutes les catégories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label><span className="sr-only">Disponibilité</span><select value={stock} onChange={event => setStock(event.target.value)}><option value="all">Toute disponibilité</option><option value="available">In stock</option><option value="unavailable">Out of stock</option></select></label></div><div className="view-toggle" role="group" aria-label="Affichage des produits"><button className={view === 'cards' ? 'active' : ''} type="button" aria-label="Vue en cartes" aria-pressed={view === 'cards'} onClick={() => setViewMode('cards')}><Grid2X2 size={18}/></button><button className={view === 'table' ? 'active' : ''} type="button" aria-label="Vue en tableau" aria-pressed={view === 'table'} onClick={() => setViewMode('table')}><List size={20}/></button></div></div>
        {status === 'loading' ? <div className="catalog-message" role="status">Chargement du catalogue…</div> : status === 'error' ? <div className="catalog-message" role="alert"><p>Le catalogue est momentanément indisponible.</p><button type="button" onClick={load}>Réessayer</button></div> : !visible.length ? <div className="catalog-message"><PackageOpen size={32}/><p>Aucun produit ne correspond à votre recherche.</p>{(query || category !== 'all' || stock !== 'all') && <button type="button" onClick={() => { setQuery(''); setCategory('all'); setStock('all') }}>Effacer les filtres</button>}</div> : view === 'cards' ? <div className="product-grid">{visible.map(product => <article className="product-card" key={product.code}><div className="card-image"><ProductImage product={product}/><StockBadge available={product.available}/></div><div className="card-body"><span className="product-category">{product.category || 'Produit'}</span><h3>{product.name}</h3><div className="product-meta"><span>{product.volume}</span><span>Réf. {product.code}</span></div></div></article>)}</div> : <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Produit</th><th>Catégorie</th><th>Format</th><th>Référence</th><th>Disponibilité</th></tr></thead><tbody>{visible.map(product => <tr key={product.code}><td><div className="table-product"><div className="table-image"><ProductImage product={product}/></div><strong>{product.name}</strong></div></td><td>{product.category}</td><td>{product.volume}</td><td className="code">{product.code}</td><td><StockBadge available={product.available}/></td></tr>)}</tbody></table></div>}
      </section>
    </main>
    <footer className="site-footer"><div><span className="footer-brand">KS</span><span>Catalogue de produits</span></div></footer>
    {showBackToTop && <button className="back-to-top" type="button" aria-label="Retour en haut" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}><ArrowUp size={19} aria-hidden="true"/></button>}
  </div>
}

createRoot(document.getElementById('root')).render(<App/>)
