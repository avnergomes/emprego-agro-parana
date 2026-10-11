// ATLAS-A11Y-HEX-SWEPT
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell, ReferenceLine, ReferenceArea,
} from 'recharts'
import Card from './Card'
import EmptyChart from './EmptyChart'
import { formatNumber, NEUTRAL, clicked } from '../utils/format'

// As séries temporais ignoram ano/periodo (contrato §6): o recorte temporal
// aparece como destaque (linha no mês, faixa no ano), nunca como corte.
function TempoTab({ agg, filters, onToggle }) {
  const { timeseries, yearly, seasonality } = agg
  const anoSel = filters.ano || (filters.periodo ? filters.periodo.slice(0, 4) : '')
  const doAno = filters.ano ? timeseries.filter((t) => t.periodo.startsWith(filters.ano)) : []
  const hasSerie = timeseries.some((t) => t.admissoes || t.demissoes)
  const onMes = (e) => e?.activeLabel && onToggle('periodo', e.activeLabel)
  const onAno = (d) => onToggle('ano', clicked(d, 'ano'))
  const destaque = (yAxisId) => [
    filters.periodo && <ReferenceLine key="mes" yAxisId={yAxisId} x={filters.periodo} stroke="#14110c" strokeWidth={2} />,
    doAno.length > 0 && (
      <ReferenceArea key="ano" yAxisId={yAxisId} x1={doAno[0].periodo} x2={doAno[doAno.length - 1].periodo} fill="#0072B2" fillOpacity={0.08} stroke="#0072B2" strokeOpacity={0.4} />
    ),
  ]

  return (
    <div className="space-y-6">
      <Card title="Série Histórica Completa (clique em um mês para filtrar)">
        <div className="h-80">
          {hasSerie ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeseries} onClick={onMes} style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} interval={5} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Legend />
                {destaque(0)}
                <Area type="monotone" dataKey="admissoes" name="Admissões" fill="#0072B2" fillOpacity={0.3} stroke="#005c8e" />
                <Area type="monotone" dataKey="demissoes" name="Demissões" fill="#D55E00" fillOpacity={0.3} stroke="#a8482c" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </Card>

      <Card title="Saldo Acumulado">
        <div className="h-64">
          {hasSerie ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeseries} onClick={onMes} style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} interval={5} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                {destaque(0)}
                <Line type="monotone" dataKey="saldo_acumulado" name="Saldo Acumulado" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Resumo Anual (clique para filtrar por ano)">
          <div className="h-64">
            {hasSerie ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatNumber(v)} />
                  <Legend />
                  <Bar dataKey="admissoes" name="Admissões" cursor="pointer" onClick={onAno}>
                    {yearly.map((entry) => {
                      const on = !anoSel || anoSel === String(entry.ano)
                      return <Cell key={entry.ano} fill={on ? '#0072B2' : NEUTRAL} stroke={anoSel === String(entry.ano) ? '#14110c' : 'none'} strokeWidth={2} />
                    })}
                  </Bar>
                  <Bar dataKey="demissoes" name="Demissões" cursor="pointer" onClick={onAno}>
                    {yearly.map((entry) => {
                      const on = !anoSel || anoSel === String(entry.ano)
                      return <Cell key={entry.ano} fill={on ? '#D55E00' : NEUTRAL} stroke={anoSel === String(entry.ano) ? '#14110c' : 'none'} strokeWidth={2} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </Card>

        <Card title="Padrão Sazonal (média mensal)">
          <div className="h-64">
            {seasonality.some((s) => s.indice) ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={seasonality}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="mes_nome" tick={{ fontSize: 11 }} />
                  <Radar name="Índice Sazonal" dataKey="indice" stroke="#005c8e" fill="#0072B2" fillOpacity={0.5} />
                  <Tooltip formatter={(v) => `${v}%`} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-2 text-center">
            Índice 100 = média mensal. Valores acima indicam meses com mais contratações.
          </p>
        </Card>
      </div>
    </div>
  )
}

export default TempoTab
