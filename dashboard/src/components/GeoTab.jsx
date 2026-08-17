// ATLAS-A11Y-HEX-SWEPT
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
const formatCurrency = (n) => n == null ? 'R$ 0,00' : `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

function GeoTab({ topMunicipios, byMunicipio, metadata, geoData, geoError, onRetryMap, mesoFilter, regIdrFilter, munFilter, cadeiaFilter, hasFilter, filterLabel, filterMessage }) {
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

  // Escala de cores por métrica — rampas de matiz único Okabe-Ito
  // (azul #0072B2 e laranja #D55E00; nunca verde+vermelho juntos)
  const ATLAS_BLUE = [0, 114, 178]
  const ATLAS_ORANGE = [213, 94, 0]
  const ATLAS_LIGHT = [243, 244, 246]

  const ramp = (rgb, intensity) => {
    const r = Math.round(ATLAS_LIGHT[0] + (rgb[0] - ATLAS_LIGHT[0]) * intensity)
    const g = Math.round(ATLAS_LIGHT[1] + (rgb[1] - ATLAS_LIGHT[1]) * intensity)
    const b = Math.round(ATLAS_LIGHT[2] + (rgb[2] - ATLAS_LIGHT[2]) * intensity)
    return `rgb(${r}, ${g}, ${b})`
  }

  const getColor = (value, metric) => {
    if (value === 0 || value === null || value === undefined) return '#f3f4f6'

    if (metric === 'admissoes') {
      return ramp(ATLAS_BLUE, Math.pow(value / (maxPositive || 1), 0.4))
    } else if (metric === 'demissoes') {
      return ramp(ATLAS_ORANGE, Math.pow(value / (maxPositive || 1), 0.4))
    }
    // Saldo - azul para positivo, laranja para negativo (divergente daltônico-seguro)
    if (value > 0) {
      return ramp(ATLAS_BLUE, Math.pow(value / (maxPositive || 1), 0.4))
    }
    return ramp(ATLAS_ORANGE, Math.pow(Math.abs(value) / Math.abs(maxNegative || 1), 0.4))
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
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} message={filterMessage} />
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Municípios Exibidos</div>
          <div className="text-2xl font-bold text-green-600">{byMunicipio.length}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm" data-i18n-translate>
          <div className="text-sm text-neutral-500">Maior Empregador</div>
          <div className="text-lg font-bold text-neutral-800">{topMunicipios[0]?.nome || 'Sem dados'}</div>
          <div className="text-sm text-neutral-500">
            {topMunicipios[0]
              ? `${formatNumber(topMunicipios[0].admissoes)} admissões`
              : 'Nenhum registro para os filtros selecionados'}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm" data-i18n-translate>
          <div className="text-sm text-neutral-500">Top 20 representa</div>
          <div className="text-2xl font-bold text-blue-600">
            {(() => {
              const totalAdm = byMunicipio.reduce((a, m) => a + (m.admissoes || 0), 0)
              if (totalAdm <= 0) return 'Sem dados'
              return `${(topMunicipios.reduce((a, m) => a + (m.admissoes || 0), 0) / totalAdm * 100).toFixed(1)}%`
            })()}
          </div>
        </div>
      </div>

      {/* Mapa Coroplético */}
      <Card title="Mapa de Emprego Agrícola por Município">
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <button
            onClick={() => setMapMetric('admissoes')}
            className={`px-3 py-1 rounded-lg text-sm ${mapMetric === 'admissoes' ? 'bg-sky-700 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            Admissões
          </button>
          <button
            onClick={() => setMapMetric('demissoes')}
            className={`px-3 py-1 rounded-lg text-sm ${mapMetric === 'demissoes' ? 'bg-orange-700 text-white' : 'bg-neutral-100 text-neutral-600'}`}
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

        <div className="h-[60vh] max-h-[480px] sm:h-[500px] sm:max-h-none bg-neutral-50 rounded-lg overflow-hidden">
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
          ) : geoError ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center" data-i18n-translate>
              <p className="text-sm text-neutral-600">
                Mapa indisponível no momento: falha ao carregar a malha municipal.
              </p>
              <button
                onClick={onRetryMap}
                className="px-4 py-2 text-sm rounded-lg bg-sky-700 text-white hover:bg-sky-800"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400" data-i18n-translate>
              Carregando mapa...
            </div>
          )}
        </div>

        {/* Legenda */}
        <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
          {mapMetric === 'saldo' ? (
            <>
              <span className="text-xs text-orange-700">- Demissões</span>
              <div className="flex">
                {[1, 0.6, 0.3, 0].map((v, i) => (
                  <div key={`neg${i}`} className="w-6 h-4" style={{ backgroundColor: getColor(-v * Math.abs(maxNegative), mapMetric) }} />
                ))}
                {[0, 0.3, 0.6, 1].map((v, i) => (
                  <div key={`pos${i}`} className="w-6 h-4" style={{ backgroundColor: getColor(v * maxPositive, mapMetric) }} />
                ))}
              </div>
              <span className="text-xs text-sky-700">+ Admissões</span>
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
          {topMunicipios.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topMunicipios} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="nome" type="category" width={100} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatNumber(v)} />
              <Legend />
              <Bar dataKey="admissoes" name="Admissões" fill="#0072B2" />
              <Bar dataKey="demissoes" name="Demissões" fill="#D55E00" />
            </BarChart>
          </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400" data-i18n-translate>Sem dados para exibir</div>
          )}
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
                  {/* Azul/laranja (par daltônico-seguro dos gráficos); sinal +/- mantém a redundância não-cromática */}
                  <td className="text-right py-2 px-2 text-sky-700">{formatNumber(m.admissoes)}</td>
                  <td className="text-right py-2 px-2 text-orange-700">{formatNumber(m.demissoes)}</td>
                  <td className={`text-right py-2 px-2 font-medium ${m.saldo >= 0 ? 'text-sky-700' : 'text-orange-700'}`}>
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
