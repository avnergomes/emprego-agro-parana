// ATLAS-A11Y-HEX-SWEPT
import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'
import Card from './Card'
import EmptyChart from './EmptyChart'
import MapaSVG from './MapaSVG'
import SortTh from './SortTh'
import { useSort, useStickyState } from '../utils/useSort'
import { formatNumber, formatCurrency, formatSigned, salTitle, sortRows, NEUTRAL, clicked, topWithSel, selIn } from '../utils/format'

// Rampas de matiz único Okabe-Ito (azul #0072B2 e laranja #D55E00; nunca verde+vermelho)
const ATLAS_BLUE = [0, 114, 178]
const ATLAS_ORANGE = [213, 94, 0]
const ATLAS_LIGHT = [243, 244, 246]
const METRIC_LABEL = { admissoes: 'Admissões', demissoes: 'Demissões', saldo: 'Saldo' }

const ramp = (rgb, t) => {
  const c = (i) => Math.round(ATLAS_LIGHT[i] + (rgb[i] - ATLAS_LIGHT[i]) * t)
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`
}

function colorFor(value, metric, maxPositive, maxNegative) {
  if (!value) return '#f3f4f6'
  if (metric === 'demissoes') return ramp(ATLAS_ORANGE, Math.pow(value / (maxPositive || 1), 0.4))
  if (value > 0) return ramp(ATLAS_BLUE, Math.pow(value / (maxPositive || 1), 0.4))
  return ramp(ATLAS_ORANGE, Math.pow(Math.abs(value) / Math.abs(maxNegative || 1), 0.4))
}

// byMunicipio/topMunicipios ignoram o filtro mun (contrato §6): com município
// filtrado, mostram a regional dele com o município destacado.
function GeoTab({ agg, filters, onToggle, municipios, geoData, geoError, onRetryMap }) {
  const { byMunicipio, topMunicipios } = agg
  const [hoveredMun, setHoveredMun] = useState(null)
  const [mapMetric, setMapMetric] = useStickyState('geo:metric', 'admissoes')
  const sort = useSort('admissoes', 'desc', 'geo')
  const sel = filters.mun

  const munDataMap = useMemo(() => Object.fromEntries(byMunicipio.map((m) => [m.codigo, m])), [byMunicipio])

  // Municípios dentro do recorte regional (para esmaecer o resto do mapa); a
  // regional do município filtrado vem de dims, não do TopoJSON.
  const scope = useMemo(() => {
    const regMun = filters.mun && municipios.find((m) => m.cod === filters.mun)?.reg
    const reg = regMun || filters.reg
    if (!reg && !filters.meso) return null
    return new Set(municipios.filter((m) => (reg ? m.reg === reg : m.meso === filters.meso)).map((m) => m.cod))
  }, [municipios, filters.mun, filters.reg, filters.meso])

  const { maxPositive, maxNegative } = useMemo(() => {
    const values = byMunicipio.map((m) => m[mapMetric] || 0)
    return { maxPositive: Math.max(...values, 0), maxNegative: Math.min(...values, 0) }
  }, [byMunicipio, mapMetric])
  const getColor = (v) => colorFor(v, mapMetric, maxPositive, maxNegative)

  const rows = sortRows(byMunicipio, sort.sortCol, sort.sortDir)
  const totalAdm = byMunicipio.reduce((a, m) => a + m.admissoes, 0)
  const topAdm = topMunicipios.reduce((a, m) => a + m.admissoes, 0)
  const topChart = topWithSel(byMunicipio, 20, 'codigo', sel) // inclui o filtrado fora do top 20
  const selTop = selIn(topChart, 'codigo', sel)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Municípios Exibidos</div>
          <div className="text-2xl font-bold text-green-700">{byMunicipio.length}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm" data-i18n-translate>
          <div className="text-sm text-neutral-500">Maior Empregador</div>
          <div className="text-lg font-bold text-neutral-800" data-i18n-skip>{topMunicipios[0]?.nome || '—'}</div>
          <div className="text-sm text-neutral-500">
            {topMunicipios[0] ? `${formatNumber(topMunicipios[0].admissoes)} admissões` : 'Nenhum registro para os filtros selecionados'}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm" data-i18n-translate>
          <div className="text-sm text-neutral-500">Top 20 representa</div>
          <div className="text-2xl font-bold text-sky-700">{totalAdm > 0 ? `${((topAdm / totalAdm) * 100).toFixed(1)}%` : '—'}</div>
        </div>
      </div>

      <Card title="Mapa de Emprego Agrícola por Município (clique para filtrar)">
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          {Object.entries(METRIC_LABEL).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMapMetric(m)}
              aria-pressed={mapMetric === m}
              className={`px-3 py-1 rounded-lg text-sm ${mapMetric === m ? (m === 'demissoes' ? 'bg-orange-700' : 'bg-sky-700') + ' text-white' : 'bg-neutral-100 text-neutral-600'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* tooltip sobreposto: fora do fluxo, para o mapa não se mover no hover */}
        <div className="relative h-[60vh] max-h-[480px] sm:h-[500px] sm:max-h-none bg-neutral-50 rounded-lg overflow-hidden">
          {hoveredMun && (
            <div className="absolute top-2 left-2 z-10 pointer-events-none bg-neutral-800 text-white px-3 py-2 rounded-lg text-sm" data-i18n-skip>
              <strong>{hoveredMun.nome}</strong> - {METRIC_LABEL[mapMetric]}: {formatNumber(hoveredMun[mapMetric] ?? 0)}
            </div>
          )}
          {geoData ? (
            <MapaSVG
              geoData={geoData}
              munDataMap={munDataMap}
              mapMetric={mapMetric}
              getColor={getColor}
              hoveredMun={hoveredMun}
              setHoveredMun={setHoveredMun}
              scope={scope}
              selectedMun={sel}
              onMunClick={(cod) => onToggle('mun', cod)}
            />
          ) : geoError ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center" data-i18n-translate>
              <p className="text-sm text-neutral-600">Mapa indisponível no momento: falha ao carregar a malha municipal.</p>
              <button onClick={onRetryMap} className="px-4 py-2 text-sm rounded-lg bg-sky-700 text-white hover:bg-sky-800">
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400" data-i18n-translate>
              Carregando mapa...
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
          {mapMetric === 'saldo' ? (
            <>
              <span className="text-xs text-orange-700">- Demissões</span>
              <div className="flex">
                {[1, 0.6, 0.3, 0].map((v) => (
                  <div key={`neg${v}`} className="w-6 h-4" style={{ backgroundColor: getColor(-v * Math.abs(maxNegative)) }} />
                ))}
                {[0, 0.3, 0.6, 1].map((v) => (
                  <div key={`pos${v}`} className="w-6 h-4" style={{ backgroundColor: getColor(v * maxPositive) }} />
                ))}
              </div>
              <span className="text-xs text-sky-700">+ Admissões</span>
            </>
          ) : (
            <>
              <span className="text-xs text-neutral-500">Menor</span>
              <div className="flex">
                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
                  <div key={v} className="w-6 h-4" style={{ backgroundColor: getColor(v * maxPositive) }} />
                ))}
              </div>
              <span className="text-xs text-neutral-500">Maior</span>
            </>
          )}
        </div>
      </Card>

      <Card title="Top 20 Municípios por Admissões (clique para filtrar)">
        <div className="h-96">
          {topChart.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="nome" type="category" width={110} tick={{ fontSize: 10 }} interval={0} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Legend />
                {[['admissoes', 'Admissões', '#0072B2'], ['demissoes', 'Demissões', '#D55E00']].map(([k, nome, cor]) => (
                  <Bar key={k} dataKey={k} name={nome} fill={cor} cursor="pointer" onClick={(d) => onToggle('mun', clicked(d, 'codigo'))}>
                    {topChart.map((m) => (
                      <Cell key={m.codigo} fill={selTop && selTop !== m.codigo ? NEUTRAL : cor} stroke={selTop === m.codigo ? '#14110c' : 'none'} strokeWidth={2} />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </Card>

      <Card title="Todos os Municípios (clique no cabeçalho para ordenar, na linha para filtrar)">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50">
              <tr className="border-b border-neutral-200">
                <th className="text-left py-3 px-2 w-10">#</th>
                <SortTh col="nome" label="Município" {...sort} />
                <SortTh col="reg" label="Regional IDR" {...sort} />
                <SortTh col="admissoes" label="Admissões" align="right" {...sort} />
                <SortTh col="demissoes" label="Demissões" align="right" {...sort} />
                <SortTh col="saldo" label="Saldo" align="right" {...sort} />
                <SortTh col="salario_medio" label="Salário Médio" align="right" {...sort} />
                <SortTh col="cadeia_dominante" label="Cadeia Dominante" {...sort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => (
                <tr
                  key={m.codigo}
                  className={`border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer ${m.codigo === sel ? 'bg-green-50 font-semibold' : ''}`}
                  onClick={() => onToggle('mun', m.codigo)}
                  aria-selected={m.codigo === sel}
                >
                  <td className="py-2 px-2 text-neutral-400">{i + 1}</td>
                  <td className="py-2 px-2 font-medium">{m.nome}</td>
                  <td className="py-2 px-2 text-neutral-500">{m.reg}</td>
                  {/* Azul/laranja (par daltônico-seguro dos gráficos); sinal +/- mantém a redundância não-cromática */}
                  <td className="text-right py-2 px-2 text-sky-700">{formatNumber(m.admissoes)}</td>
                  <td className="text-right py-2 px-2 text-orange-700">{formatNumber(m.demissoes)}</td>
                  <td className={`text-right py-2 px-2 font-medium ${m.saldo >= 0 ? 'text-sky-700' : 'text-orange-700'}`}>{formatSigned(m.saldo)}</td>
                  <td className="text-right py-2 px-2" title={salTitle(m.salario_medio)}>{formatCurrency(m.salario_medio)}</td>
                  <td className="py-2 px-2 text-neutral-500">{m.cadeia_dominante || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-neutral-400 py-6 text-center">Sem dados para exibir</p>}
        </div>
        <p className="text-xs text-neutral-400 mt-2">Total: {rows.length} municípios</p>
      </Card>
    </div>
  )
}

export default GeoTab
