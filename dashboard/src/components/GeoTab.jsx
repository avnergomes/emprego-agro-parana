import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'
import Card from './Card'
import FilterIndicator from './FilterIndicator'
import MapaSVG from './MapaSVG'

// Formatadores
const formatNumber = (n) => n?.toLocaleString('pt-BR') || '0'
const formatCurrency = (n) => `R$ ${n?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` || 'R$ 0,00'

function GeoTab({ topMunicipios, byMunicipio, metadata, geoData, mesoFilter, regIdrFilter, munFilter, cadeiaFilter, hasFilter, filterLabel }) {
  const [hoveredMun, setHoveredMun] = useState(null)
  const [mapMetric, setMapMetric] = useState('admissoes')
  const [sortColumn, setSortColumn] = useState('admissoes')
  const [sortDirection, setSortDirection] = useState('desc')

  // Mapear código do município para dados
  const munDataMap = useMemo(() => {
    const map = {}
    byMunicipio.forEach(m => {
      map[m.codigo] = m
    })
    return map
  }, [byMunicipio])

  // Calcular max para escala
  const { maxPositive, maxNegative } = useMemo(() => {
    const values = byMunicipio.map(m => m[mapMetric] || 0)
    return {
      maxPositive: Math.max(...values, 0),
      maxNegative: Math.min(...values, 0)
    }
  }, [byMunicipio, mapMetric])

  // Escala de cores por métrica
  const getColor = (value, metric) => {
    if (value === 0 || value === null || value === undefined) return '#f3f4f6'

    if (metric === 'admissoes') {
      // Verde
      const intensity = Math.pow(value / maxPositive, 0.4)
      const r = Math.round(220 - intensity * 186)
      const g = Math.round(252 - intensity * 55)
      const b = Math.round(231 - intensity * 140)
      return `rgb(${r}, ${g}, ${b})`
    } else if (metric === 'demissoes') {
      // Vermelho
      const intensity = Math.pow(value / maxPositive, 0.4)
      const r = Math.round(254 - intensity * 20)
      const g = Math.round(226 - intensity * 158)
      const b = Math.round(226 - intensity * 158)
      return `rgb(${r}, ${g}, ${b})`
    } else {
      // Saldo - verde para positivo, vermelho para negativo
      if (value > 0) {
        const intensity = Math.pow(value / maxPositive, 0.4)
        const r = Math.round(220 - intensity * 186)
        const g = Math.round(252 - intensity * 55)
        const b = Math.round(231 - intensity * 140)
        return `rgb(${r}, ${g}, ${b})`
      } else {
        const intensity = Math.pow(Math.abs(value) / Math.abs(maxNegative), 0.4)
        const r = Math.round(254 - intensity * 20)
        const g = Math.round(226 - intensity * 158)
        const b = Math.round(226 - intensity * 158)
        return `rgb(${r}, ${g}, ${b})`
      }
    }
  }

  // Ordenar municípios
  const sortedMunicipios = useMemo(() => {
    const data = [...byMunicipio]
    data.sort((a, b) => {
      let aVal = a[sortColumn]
      let bVal = b[sortColumn]
      // Para strings, comparar como texto
      if (sortColumn === 'nome' || sortColumn === 'cadeia_dominante') {
        aVal = aVal || ''
        bVal = bVal || ''
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      // Para números
      aVal = aVal || 0
      bVal = bVal || 0
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
    })
    return data
  }, [byMunicipio, sortColumn, sortDirection])

  // Toggle ordenação
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  // Componente de cabeçalho ordenável
  const SortHeader = ({ column, label, align = 'left' }) => (
    <th
      className={`py-3 px-2 cursor-pointer hover:bg-neutral-100 select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => handleSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortColumn === column && (
          <span className="text-green-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  )

  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Municípios Exibidos</div>
          <div className="text-2xl font-bold text-green-600">{byMunicipio.length}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Maior Empregador</div>
          <div className="text-lg font-bold text-neutral-800">{topMunicipios[0]?.nome}</div>
          <div className="text-sm text-neutral-500">{formatNumber(topMunicipios[0]?.admissoes)} admissões</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Top 20 representa</div>
          <div className="text-2xl font-bold text-blue-600">
            {byMunicipio.length > 0 ? (topMunicipios.reduce((a, m) => a + m.admissoes, 0) / byMunicipio.reduce((a, m) => a + m.admissoes, 0) * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>

      {/* Mapa Coroplético */}
      <Card title="Mapa de Emprego Agrícola por Município">
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <button
            onClick={() => setMapMetric('admissoes')}
            className={`px-3 py-1 rounded-lg text-sm ${mapMetric === 'admissoes' ? 'bg-green-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            Admissões
          </button>
          <button
            onClick={() => setMapMetric('demissoes')}
            className={`px-3 py-1 rounded-lg text-sm ${mapMetric === 'demissoes' ? 'bg-red-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            Demissões
          </button>
          <button
            onClick={() => setMapMetric('saldo')}
            className={`px-3 py-1 rounded-lg text-sm ${mapMetric === 'saldo' ? 'bg-blue-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            Saldo
          </button>
          {(mesoFilter || regIdrFilter) && (
            <span className="text-sm text-green-600 ml-2">
              Filtro ativo: {mesoFilter || regIdrFilter}
            </span>
          )}
        </div>

        {hoveredMun && (
          <div className="bg-neutral-800 text-white px-3 py-2 rounded-lg mb-2 text-sm inline-block">
            <strong>{hoveredMun.nome}</strong> - {mapMetric === 'admissoes' ? 'Admissões' : mapMetric === 'demissoes' ? 'Demissões' : 'Saldo'}: {formatNumber(hoveredMun[mapMetric])}
          </div>
        )}

        <div className="h-[500px] bg-neutral-50 rounded-lg overflow-hidden">
          {geoData ? (
            <MapaSVG
              geoData={geoData}
              munDataMap={munDataMap}
              mapMetric={mapMetric}
              getColor={(val) => getColor(val, mapMetric)}
              hoveredMun={hoveredMun}
              setHoveredMun={setHoveredMun}
              mesoFilter={mesoFilter}
              regIdrFilter={regIdrFilter}
              munFilter={munFilter}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400">
              Carregando mapa...
            </div>
          )}
        </div>

        {/* Legenda */}
        <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
          {mapMetric === 'saldo' ? (
            <>
              <span className="text-xs text-red-600">- Demissões</span>
              <div className="flex">
                {[1, 0.6, 0.3, 0].map((v, i) => (
                  <div key={`neg${i}`} className="w-6 h-4" style={{ backgroundColor: getColor(-v * Math.abs(maxNegative), mapMetric) }} />
                ))}
                {[0, 0.3, 0.6, 1].map((v, i) => (
                  <div key={`pos${i}`} className="w-6 h-4" style={{ backgroundColor: getColor(v * maxPositive, mapMetric) }} />
                ))}
              </div>
              <span className="text-xs text-green-600">+ Admissões</span>
            </>
          ) : (
            <>
              <span className="text-xs text-neutral-500">Menor</span>
              <div className="flex">
                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v, i) => (
                  <div key={i} className="w-6 h-4" style={{ backgroundColor: getColor(v * maxPositive, mapMetric) }} />
                ))}
              </div>
              <span className="text-xs text-neutral-500">Maior</span>
            </>
          )}
        </div>
      </Card>

      {/* Top 20 municípios */}
      <Card title="Top 20 Municípios por Admissões">
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topMunicipios} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="nome" type="category" width={100} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatNumber(v)} />
              <Legend />
              <Bar dataKey="admissoes" name="Admissões" fill="#22c55e" />
              <Bar dataKey="demissoes" name="Demissões" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tabela */}
      <Card title="Todos os Municípios (clique no cabeçalho para ordenar)">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50">
              <tr className="border-b border-neutral-200">
                <th className="text-left py-3 px-2 w-10">#</th>
                <SortHeader column="nome" label="Município" />
                <SortHeader column="admissoes" label="Admissões" align="right" />
                <SortHeader column="demissoes" label="Demissões" align="right" />
                <SortHeader column="saldo" label="Saldo" align="right" />
                <SortHeader column="salario_medio" label="Salário Médio" align="right" />
                <SortHeader column="cadeia_dominante" label="Cadeia Dominante" />
              </tr>
            </thead>
            <tbody>
              {sortedMunicipios.map((m, i) => (
                <tr key={m.codigo} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2 px-2 text-neutral-400">{i + 1}</td>
                  <td className="py-2 px-2 font-medium">{m.nome}</td>
                  <td className="text-right py-2 px-2 text-green-600">{formatNumber(m.admissoes)}</td>
                  <td className="text-right py-2 px-2 text-red-600">{formatNumber(m.demissoes)}</td>
                  <td className={`text-right py-2 px-2 font-medium ${m.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {m.saldo >= 0 ? '+' : ''}{formatNumber(m.saldo)}
                  </td>
                  <td className="text-right py-2 px-2">{formatCurrency(m.salario_medio)}</td>
                  <td className="py-2 px-2 text-neutral-500">{m.cadeia_dominante}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-400 mt-2">Total: {sortedMunicipios.length} municípios</p>
      </Card>
    </div>
  )
}

export default GeoTab
