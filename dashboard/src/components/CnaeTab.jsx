import { useState, useMemo } from 'react'
import Card from './Card'
import FilterIndicator from './FilterIndicator'

// Formatadores
const formatNumber = (n) => n?.toLocaleString('pt-BR') || '0'
const formatCurrency = (n) => `R$ ${n?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` || 'R$ 0,00'

function CnaeTab({ byCnae, byCadeia, hasFilter, filterLabel, onCadeiaClick, cadeiaFilter: globalCadeiaFilter }) {
  const [filter, setFilter] = useState('')
  const [localCadeiaFilter, setLocalCadeiaFilter] = useState('')
  // Use global filter if set, otherwise use local
  const effectiveCadeiaFilter = globalCadeiaFilter || localCadeiaFilter
  const [sortCol, setSortCol] = useState('admissoes')
  const [sortDir, setSortDir] = useState('desc')

  const filtered = useMemo(() => {
    let data = byCnae.filter(c => {
      const matchText = filter === '' || c.cnae.includes(filter) || c.cadeia.toLowerCase().includes(filter.toLowerCase())
      const matchCadeia = effectiveCadeiaFilter === '' || c.cadeia === effectiveCadeiaFilter
      return matchText && matchCadeia
    })
    data.sort((a, b) => {
      let aVal = a[sortCol], bVal = b[sortCol]
      if (sortCol === 'cnae' || sortCol === 'cadeia') return sortDir === 'asc' ? (aVal || '').localeCompare(bVal || '') : (bVal || '').localeCompare(aVal || '')
      return sortDir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0)
    })
    return data
  }, [byCnae, filter, effectiveCadeiaFilter, sortCol, sortDir])

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortTh = ({ col, label, align = 'left' }) => (
    <th className={`py-3 px-2 cursor-pointer hover:bg-neutral-100 select-none ${align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => toggleSort(col)}>
      {label} {sortCol === col && <span className="text-green-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )

  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      <Card>
        <div className="flex flex-wrap gap-4 mb-4">
          <input
            type="text"
            placeholder="Buscar por código CNAE..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <select
            value={effectiveCadeiaFilter}
            onChange={(e) => {
              setLocalCadeiaFilter(e.target.value)
              // Se há um filtro global, usar o global
              if (onCadeiaClick) onCadeiaClick(e.target.value || '')
            }}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Todas as cadeias</option>
            {byCadeia.map(c => (
              <option key={c.cadeia} value={c.cadeia}>{c.cadeia}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50">
              <tr className="border-b border-neutral-200">
                <SortTh col="cnae" label="CNAE" />
                <SortTh col="descricao" label="Descrição" />
                <SortTh col="cadeia" label="Cadeia" />
                <SortTh col="admissoes" label="Admissões" align="right" />
                <SortTh col="demissoes" label="Demissões" align="right" />
                <SortTh col="saldo" label="Saldo" align="right" />
                <SortTh col="salario_mediana" label="Mediana" align="right" />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(c => (
                <tr key={c.cnae} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2 px-2 font-mono text-xs">{c.cnae}</td>
                  <td className="py-2 px-2 text-xs max-w-[250px] truncate" title={c.descricao}>{c.descricao}</td>
                  <td className="py-2 px-2 text-xs">{c.cadeia}</td>
                  <td className="text-right py-2 px-2 text-green-600">{formatNumber(c.admissoes)}</td>
                  <td className="text-right py-2 px-2 text-red-600">{formatNumber(c.demissoes)}</td>
                  <td className={`text-right py-2 px-2 font-medium ${c.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {c.saldo >= 0 ? '+' : ''}{formatNumber(c.saldo)}
                  </td>
                  <td className="text-right py-2 px-2">{formatCurrency(c.salario_mediana)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <p className="text-sm text-neutral-500 mt-4 text-center">
              Mostrando 100 de {filtered.length} atividades
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

export default CnaeTab
