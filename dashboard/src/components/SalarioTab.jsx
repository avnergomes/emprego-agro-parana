import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import Card from './Card'
import FilterIndicator from './FilterIndicator'

// Formatadores
const formatNumber = (n) => n?.toLocaleString('pt-BR') || '0'
const formatCurrency = (n) => `R$ ${n?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` || 'R$ 0,00'

function SalarioTab({ salaryDistribution, byCadeia, byEscolaridade, hasFilter, filterLabel, onCadeiaClick, cadeiaFilter, onEscolaridadeClick, escolaridadeFilter }) {
  const [sortCol, setSortCol] = useState('p50')
  const [sortDir, setSortDir] = useState('desc')

  const salarioData = salaryDistribution
    .filter(s => s.cadeia !== 'Cacau' && s.cadeia !== 'Fumo')
    .sort((a, b) => b.p50 - a.p50)
    .slice(0, 12)

  const sortedSalary = useMemo(() => {
    const data = [...salaryDistribution]
    data.sort((a, b) => {
      let aVal = a[sortCol], bVal = b[sortCol]
      if (sortCol === 'cadeia') return sortDir === 'asc' ? (aVal || '').localeCompare(bVal || '') : (bVal || '').localeCompare(aVal || '')
      return sortDir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0)
    })
    return data
  }, [salaryDistribution, sortCol, sortDir])

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
      {/* Box plot style - Clicável */}
      <Card title="Distribuição Salarial por Cadeia (clique para filtrar)">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={salarioData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${v.toLocaleString()}`} />
              <YAxis dataKey="cadeia" type="category" width={140} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar
                dataKey="p50"
                name="Mediana"
                cursor="pointer"
                onClick={(data) => onCadeiaClick && onCadeiaClick(data.cadeia)}
              >
                {salarioData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.cadeia === cadeiaFilter ? '#15803d' : '#22c55e'}
                    stroke={entry.cadeia === cadeiaFilter ? '#166534' : 'none'}
                    strokeWidth={entry.cadeia === cadeiaFilter ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tabela de percentis */}
      <Card title="Percentis Salariais por Cadeia (clique para ordenar)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <SortTh col="cadeia" label="Cadeia" />
                <SortTh col="p10" label="P10" align="right" />
                <SortTh col="p25" label="P25" align="right" />
                <SortTh col="p50" label="Mediana" align="right" />
                <SortTh col="p75" label="P75" align="right" />
                <SortTh col="p90" label="P90" align="right" />
                <SortTh col="mean" label="Média" align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedSalary.map(s => (
                <tr key={s.cadeia} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2 px-2 font-medium">{s.cadeia}</td>
                  <td className="text-right py-2 px-2 text-neutral-500">{formatCurrency(s.p10)}</td>
                  <td className="text-right py-2 px-2 text-neutral-500">{formatCurrency(s.p25)}</td>
                  <td className="text-right py-2 px-2 font-bold text-green-600">{formatCurrency(s.p50)}</td>
                  <td className="text-right py-2 px-2 text-neutral-500">{formatCurrency(s.p75)}</td>
                  <td className="text-right py-2 px-2 text-neutral-500">{formatCurrency(s.p90)}</td>
                  <td className="text-right py-2 px-2">{formatCurrency(s.mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Salário por escolaridade - Clicável */}
      <Card title="Salário por Escolaridade (clique para filtrar)">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byEscolaridade.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="escolaridade" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${v.toLocaleString()}`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar
                dataKey="salario_medio"
                name="Salário Médio"
                cursor="pointer"
                onClick={(data) => onEscolaridadeClick && onEscolaridadeClick(data.escolaridade)}
              >
                {byEscolaridade.slice(0, 8).map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.escolaridade === escolaridadeFilter ? '#d97706' : '#f59e0b'}
                    stroke={entry.escolaridade === escolaridadeFilter ? '#b45309' : 'none'}
                    strokeWidth={entry.escolaridade === escolaridadeFilter ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}

export default SalarioTab
