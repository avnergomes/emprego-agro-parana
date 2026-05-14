// ATLAS-A11Y-HEX-SWEPT
import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Treemap
} from 'recharts'
import Card from './Card'
import FilterIndicator from './FilterIndicator'
import BumpChart from './BumpChart'

// Formatadores
const formatNumber = (n) => n?.toLocaleString('pt-BR') || '0'
const formatCurrency = (n) => `R$ ${n?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` || 'R$ 0,00'

function CadeiaTab({ byCadeia, timeseriesCadeia, crossCadeiaSexo, selectedCadeia, setSelectedCadeia, hasFilter, filterLabel, onCadeiaClick, cadeiaFilter }) {
  const top10 = byCadeia.slice(0, 10)
  const [sortCol, setSortCol] = useState('admissoes')
  const [sortDir, setSortDir] = useState('desc')

  const sortedCadeias = useMemo(() => {
    const data = [...byCadeia]
    data.sort((a, b) => {
      let aVal = a[sortCol], bVal = b[sortCol]
      if (sortCol === 'cadeia') return sortDir === 'asc' ? (aVal || '').localeCompare(bVal || '') : (bVal || '').localeCompare(aVal || '')
      return sortDir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0)
    })
    return data
  }, [byCadeia, sortCol, sortDir])

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
      {/* Treemap - Clicável */}
      <Card title="Distribuição por Cadeia Produtiva (clique para filtrar)">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={top10.map(c => ({
                name: c.cadeia,
                size: c.admissoes,
                fill: c.cadeia === cadeiaFilter ? '#004a72' : c.cor,
                isSelected: c.cadeia === cadeiaFilter
              }))}
              dataKey="size"
              aspectRatio={4/3}
              stroke="#fff"
              onClick={(node) => onCadeiaClick && onCadeiaClick(node.name)}
              content={({ x, y, width, height, name, fill, isSelected }) => (
                <g style={{ cursor: 'pointer' }}>
                  <rect
                    x={x} y={y} width={width} height={height}
                    fill={fill}
                    stroke={isSelected ? '#000' : '#fff'}
                    strokeWidth={isSelected ? 3 : 2}
                  />
                  {width > 60 && height > 30 && (
                    <text x={x + width/2} y={y + height/2} textAnchor="middle" fill="#fff" fontSize={12} fontWeight="bold">
                      {name}
                    </text>
                  )}
                </g>
              )}
            />
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tabela detalhada */}
      <Card title="Detalhamento por Cadeia Produtiva (clique para ordenar)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <SortTh col="cadeia" label="Cadeia" />
                <SortTh col="admissoes" label="Admissões" align="right" />
                <SortTh col="demissoes" label="Demissões" align="right" />
                <SortTh col="saldo" label="Saldo" align="right" />
                <SortTh col="salario_medio" label="Salário Médio" align="right" />
                <SortTh col="pct_admissoes" label="%" align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedCadeias.map(c => (
                <tr
                  key={c.cadeia}
                  className={`border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer ${c.cadeia === cadeiaFilter ? 'bg-green-50' : ''}`}
                  onClick={() => onCadeiaClick && onCadeiaClick(c.cadeia)}
                >
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.cor }} />
                      {c.cadeia}
                      {c.cadeia === cadeiaFilter && <span className="text-xs text-green-600 ml-1">(filtrado)</span>}
                    </div>
                  </td>
                  <td className="text-right py-2 px-2 text-green-600">{formatNumber(c.admissoes)}</td>
                  <td className="text-right py-2 px-2 text-red-600">{formatNumber(c.demissoes)}</td>
                  <td className={`text-right py-2 px-2 font-medium ${c.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {c.saldo >= 0 ? '+' : ''}{formatNumber(c.saldo)}
                  </td>
                  <td className="text-right py-2 px-2">{formatCurrency(c.salario_medio)}</td>
                  <td className="text-right py-2 px-2 text-neutral-500">{c.pct_admissoes}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Gênero por cadeia */}
      <Card title="Distribuição de Gênero por Cadeia">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={
              top10.map(c => {
                const masc = crossCadeiaSexo.find(x => x.cadeia === c.cadeia && x.sexo === 'Masculino')
                const fem = crossCadeiaSexo.find(x => x.cadeia === c.cadeia && x.sexo === 'Feminino')
                const total = (masc?.admissoes || 0) + (fem?.admissoes || 0)
                return {
                  cadeia: c.cadeia,
                  masculino: total > 0 ? ((masc?.admissoes || 0) / total * 100).toFixed(1) : 0,
                  feminino: total > 0 ? ((fem?.admissoes || 0) / total * 100).toFixed(1) : 0,
                }
              })
            } layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis dataKey="cadeia" type="category" width={120} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Bar dataKey="masculino" name="Masculino" stackId="a" fill="#3b82f6" />
              <Bar dataKey="feminino" name="Feminino" stackId="a" fill="#ec4899" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* D3 BumpChart - Evolução do Ranking */}
      <BumpChart
        data={timeseriesCadeia}
        title="Evolução do Ranking de Cadeias"
        width={800}
        height={450}
        metric="saldo"
        topN={10}
      />
    </div>
  )
}

export default CadeiaTab
