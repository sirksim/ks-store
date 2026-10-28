import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesCatalog, toggleValue, sortCatalogProducts, catalogViewForScreen } from './filterModel.js'

test('chip selection and removal update the selected values', () => {
  const selected = toggleValue(toggleValue([], 'Vin'), 'Rhum')
  assert.deepEqual(selected, ['Vin', 'Rhum'])
  assert.deepEqual(toggleValue(selected, 'Vin'), ['Rhum'])
})

test('catalog categories match any selection and combine with text and stock', () => {
  const products = [
    { code: 'V1', name: 'Vin blanc', category: 'Vin', volume: '75 cl', available: true },
    { code: 'R1', name: 'Rhum vieux', category: 'Rhum', volume: '70 cl', available: false },
    { code: 'B1', name: 'Bière blonde', category: 'Bière', volume: '33 cl', available: true },
  ]
  assert.deepEqual(products.filter(item => matchesCatalog(item, '', ['Vin', 'Rhum'], 'all')).map(item => item.code), ['V1', 'R1'])
  assert.deepEqual(products.filter(item => matchesCatalog(item, '', [], 'all')).map(item => item.code), ['V1', 'R1', 'B1'])
  assert.deepEqual(products.filter(item => matchesCatalog(item, 'rhUM', ['Vin', 'Rhum'], 'unavailable')).map(item => item.code), ['R1'])
})

test('catalog sorting uses French names and categories without changing source order', () => {
  const products = [
    { code: '3', name: 'Zeste', category: 'Épicerie' },
    { code: '2', name: 'Éclair', category: 'Boisson' },
    { code: '1', name: 'Abricot', category: 'Boisson' },
  ]
  assert.deepEqual(sortCatalogProducts(products, 'default').map(item => item.code), ['3', '2', '1'])
  assert.deepEqual(sortCatalogProducts(products, 'name').map(item => item.code), ['1', '2', '3'])
  assert.deepEqual(sortCatalogProducts(products, 'category').map(item => item.code), ['1', '2', '3'])
  assert.deepEqual(products.map(item => item.code), ['3', '2', '1'])
})

test('mobile cards do not overwrite the preferred desktop view', () => {
  assert.equal(catalogViewForScreen('table', true), 'cards')
  assert.equal(catalogViewForScreen('table', false), 'table')
  assert.equal(catalogViewForScreen('cards', false), 'cards')
})
