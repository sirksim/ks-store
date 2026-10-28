import React, { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { toggleValue } from './filterModel'
import './multiSelect.css'

export default function MultiSelect({ label, options, value = [], onChange, placeholder = 'Tout afficher' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef(null)
  const input = useRef(null)
  const id = React.useId()
  const selected = Array.isArray(value) ? value : value ? [value] : []
  const choices = options.filter(option => option.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')))
  useEffect(() => {
    if (!open) return
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const toggle = option => onChange(toggleValue(selected, option))
  const keyDown = event => {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true)
      setActive(index => Math.max(0, Math.min(choices.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))))
    }
    if (event.key === 'Enter' && open && choices[active]) { event.preventDefault(); toggle(choices[active]) }
    if (event.key === 'Backspace' && !query && selected.length) onChange(selected.slice(0, -1))
  }
  return <div className="multi-select" ref={root}>
    <label htmlFor={id}>{label}</label>
    <div className="multi-select-control" onClick={() => { setOpen(true); input.current?.focus() }}>
      {selected.map(option => <span className="multi-select-chip" key={option}>{option}<button type="button" aria-label={`Retirer ${option}`} onClick={event => { event.stopPropagation(); onChange(toggleValue(selected, option)) }}><X size={12}/></button></span>)}
      <input ref={input} id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-menu`} aria-autocomplete="list" aria-label={label} value={query} placeholder={selected.length ? 'Rechercher…' : placeholder} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true) }} onKeyDown={keyDown}/>
      {selected.length > 0 && <button type="button" className="multi-select-clear" aria-label={`Effacer ${label}`} onClick={event => { event.stopPropagation(); onChange([]); setQuery('') }}><X size={15}/></button>}
      <ChevronDown size={15} aria-hidden="true"/>
    </div>
    {open && <div className="multi-select-menu" id={`${id}-menu`} role="listbox" aria-multiselectable="true">
      {choices.length ? choices.map((option, index) => <button type="button" role="option" aria-selected={selected.includes(option)} className={index === active ? 'is-active' : ''} key={option} onMouseDown={event => event.preventDefault()} onClick={() => { toggle(option); input.current?.focus() }}><span className="multi-select-check">{selected.includes(option) && <Check size={13}/>}</span>{option}</button>) : <p>Aucun résultat</p>}
    </div>}
  </div>
}
