import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Search, ArrowUp } from 'lucide-react'
import { useTable } from '@tanstack/react-table'
import { matchesCatalog, sortCatalogProducts, toggleValue, catalogViewForScreen } from './filterModel'
import { catalogColumns, catalogPageSize, catalogPageSizes, catalogTableFeatures, suggestedPriceLabel } from './catalogTable'
import './public.css'

const palette = [
  ['#e3e7e5', '#39534d'], ['#ebe5dc', '#6d513e'], ['#dfe8ec', '#375c6e'],
  ['#e8e4e4', '#62545a'], ['#e9e5dd', '#665845'], ['#e0e9e3', '#426450'],
  ['#e4e9e9', '#46606a'], ['#e9e4de', '#715944'],
]
const readPreference = (key, fallback) => {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
const savePreference = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* Storage may be unavailable. */ }
}

function ProductVisual({ product, index }) {
  const [failed, setFailed] = useState(false)
  const [background, ink] = palette[index % palette.length]
  return <div className="product-visual" style={{ '--visual-bg': background, '--visual-ink': ink }}>
    {product.picture && !failed
      ? <img src={`/images/${encodeURIComponent(product.picture)}`} alt={`Photo de ${product.name}`} loading="lazy" onError={() => setFailed(true)}/>
      : <div className="placeholder-art" role="img" aria-label="Photo indisponible">
        <span className="package" aria-hidden="true"/><span className="visual-label">Visuel non disponible</span>
      </div>}
  </div>
}

function StockBadge({ available }) {
  return <span className={`stock ${available ? 'available' : 'unavailable'}`}>
    {available ? 'En stock' : 'Épuisé'}
  </span>
}

function ProductCard({ product, index }) {
  return <article className="product-card">
    <ProductVisual product={product} index={index}/>
    <div className="card-content">
      <span className="card-category">{product.category || 'Produit'}</span>
      <h4>{product.shortName || product.name}</h4>
      <div className="card-bottom">
        <div className="card-meta"><span>{product.volume || 'Format non précisé'}</span><span>Réf. {product.code}</span></div>
        <span className="card-price"><small>Prix conseillé</small><strong>{suggestedPriceLabel(product.suggestedPrice)}</strong></span>
      </div>
      <StockBadge available={product.available}/>
    </div>
  </article>
}

function ProductTable({ products }) {
  return <div className="table-wrap"><table className="product-table">
    <thead><tr><th scope="col">Produit</th><th scope="col">Catégorie</th><th scope="col">Format</th><th scope="col">Référence</th><th scope="col">Prix conseillé</th><th scope="col">Disponibilité</th></tr></thead>
    <tbody>{products.map(product => <tr key={product.code}>
      <td className="table-name">{product.name}</td>
      <td>{product.category || '—'}</td>
      <td>{product.volume || '—'}</td>
      <td>{product.code}</td>
      <td className="table-price">{suggestedPriceLabel(product.suggestedPrice)}</td>
      <td><StockBadge available={product.available}/></td>
    </tr>)}</tbody>
  </table></div>
}

function App() {
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading')
  const [query, setQuery] = useState('')
  const [categoriesSelected, setCategoriesSelected] = useState([])
  const [stock, setStock] = useState('all')
  const [sort, setSort] = useState('default')
  const [view, setView] = useState(() => readPreference('ks-catalog-view', 'cards') === 'table' ? 'table' : 'cards')
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [pagination, setPagination] = useState(() => ({
    pageIndex: 0, pageSize: catalogPageSize(readPreference('ks-catalog-page-size', '12')),
  }))
  const [showBackToTop, setShowBackToTop] = useState(false)

  const load = async () => {
    setStatus('loading')
    try {
      const response = await fetch('/api/catalog', { cache: 'no-store' })
      if (!response.ok) throw new Error('Catalogue indisponible')
      const body = await response.json()
      if (!Array.isArray(body.products)) throw new Error('Réponse invalide')
      setProducts(body.products)
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
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const update = () => setShowBackToTop(window.scrollY > 300)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  const categories = useMemo(() => [...new Set(products.map(item => item.category).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr')), [products])
  const visible = useMemo(() => sortCatalogProducts(
    products.filter(item => matchesCatalog(item, query, categoriesSelected, stock)), sort,
  ), [products, query, categoriesSelected, stock, sort])
  const table = useTable({ features: catalogTableFeatures, data: visible, columns: catalogColumns,
    state: { pagination }, onPaginationChange: setPagination, getRowId: row => row.code })
  const pageProducts = table.getRowModel().rows.map(row => row.original)
  const pageCount = table.getPageCount()
  useEffect(() => {
    if (pagination.pageIndex > Math.max(0, pageCount - 1))
      setPagination(current => ({ ...current, pageIndex: Math.max(0, pageCount - 1) }))
  }, [pagination.pageIndex, pageCount])

  const resetPage = () => setPagination(current => current.pageIndex ? { ...current, pageIndex: 0 } : current)
  const clearFilters = () => { setQuery(''); setCategoriesSelected([]); setStock('all'); resetPage() }
  const changePageSize = event => {
    const pageSize = catalogPageSize(event.target.value)
    savePreference('ks-catalog-page-size', String(pageSize))
    setPagination({ pageIndex: 0, pageSize })
  }
  const changeView = mode => { setView(mode); savePreference('ks-catalog-view', mode) }
  const changePage = direction => {
    if (direction === 'previous') table.previousPage()
    else table.nextPage()
    document.getElementById('results-heading')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  const activeView = catalogViewForScreen(view, mobile)
  const countLabel = `${visible.length} produit${visible.length === 1 ? '' : 's'}`
  const hasFilters = Boolean(query || categoriesSelected.length || stock !== 'all')

  return <div className="public-site" id="top">
    <a className="skip" href="#catalog">Aller au catalogue</a>
    <header className="topbar"><div className="shell topbar-inner">
      <a className="logo" href="#top" aria-label="KS, retour en haut"><span className="logo-mark">KS</span></a>
      <span className="topbar-label">Catalogue</span>
    </div></header>
    <main><section className="catalog shell" id="catalog" aria-labelledby="results-heading">
      <span className="browse-label">Parcourir par catégorie</span>
      <div className="category-rail" role="group" aria-label="Filtrer par catégorie">
        <button type="button" aria-pressed={categoriesSelected.length === 0} onClick={() => { setCategoriesSelected([]); resetPage() }}>Tout voir</button>
        {categories.map(category => <button type="button" key={category} aria-pressed={categoriesSelected.includes(category)}
          onClick={() => { setCategoriesSelected(current => toggleValue(current, category)); resetPage() }}>{category}</button>)}
      </div>
      <div className="toolbar" role="search">
        <label className="control search-control"><span>Rechercher</span><span className="search-wrap"><Search size={19} aria-hidden="true"/>
          <input type="search" value={query} onChange={event => { setQuery(event.target.value); resetPage() }}
            placeholder="Nom, catégorie ou référence" autoComplete="off"/></span></label>
        <label className="control"><span>Disponibilité</span><select value={stock} onChange={event => { setStock(event.target.value); resetPage() }}>
          <option value="all">Tout afficher</option><option value="available">En stock</option><option value="unavailable">Épuisé</option>
        </select></label>
        <label className="control"><span>Trier par</span><select value={sort} onChange={event => { setSort(event.target.value); resetPage() }}>
          <option value="default">Sélection KS</option><option value="name">Nom A–Z</option><option value="category">Catégorie A–Z</option>
        </select></label>
        <div className="control view-setting"><span>Affichage</span><div className="view-control" role="group" aria-label="Affichage des produits">
          <button type="button" aria-pressed={activeView === 'cards'} onClick={() => changeView('cards')}>Grille</button>
          <button type="button" aria-pressed={activeView === 'table'} onClick={() => changeView('table')}>Liste</button>
        </div></div>
      </div>
      <div className="result-line"><h2 id="results-heading">{categoriesSelected.length === 1 ? categoriesSelected[0] : 'La sélection'}</h2>
        <span aria-live="polite">{status === 'ready' ? countLabel : '—'}</span></div>
      {status === 'loading' ? <div className="skeleton-grid" role="status" aria-label="Chargement du catalogue">
        {Array.from({ length: 4 }, (_, index) => <div className="skeleton" key={index}/>)}
      </div> : status === 'error' ? <div className="catalog-message" role="alert"><h3>Catalogue indisponible</h3>
        <p>Le catalogue est momentanément indisponible.</p><button type="button" onClick={load}>Réessayer</button></div>
        : !products.length ? <div className="catalog-message"><h3>Le catalogue est vide</h3>
          <p>Aucun produit n’est publié pour le moment. Revenez bientôt.</p></div>
          : !visible.length ? <div className="catalog-message"><h3>Aucun résultat</h3>
            <p>Essayez un autre nom, une autre catégorie ou effacez les filtres.</p>
            {hasFilters && <button type="button" onClick={clearFilters}>Effacer les filtres</button>}</div>
            : <>
              {activeView === 'cards'
                ? <div className="product-grid">{pageProducts.map((product, index) =>
                  <ProductCard product={product} index={pagination.pageIndex * pagination.pageSize + index} key={product.code}/>)}</div>
                : <ProductTable products={pageProducts}/>}
              <nav className="catalog-pagination" aria-label="Pages du catalogue">
                <label>Produits par page <select value={pagination.pageSize} onChange={changePageSize}>
                  {catalogPageSizes.map(size => <option key={size} value={size}>{size}</option>)}
                </select></label>
                <div className="page-buttons"><button type="button" onClick={() => changePage('previous')} disabled={!table.getCanPreviousPage()}>Précédent</button>
                  <span className="page-number">{pagination.pageIndex + 1} / {pageCount}</span>
                  <button type="button" onClick={() => changePage('next')} disabled={!table.getCanNextPage()}>Suivant</button></div>
              </nav>
            </>}
    </section></main>
    <footer className="site-footer"><div className="shell footer-inner"><strong>KS</strong><span>Catalogue de produits · Explorez la sélection à votre rythme.</span></div></footer>
    {showBackToTop && <button className="back-to-top" type="button" aria-label="Retour en haut"
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>
      <ArrowUp size={19} aria-hidden="true"/>
    </button>}
  </div>
}

createRoot(document.getElementById('root')).render(<App/>)
