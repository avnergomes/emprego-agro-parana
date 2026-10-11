// ATLAS-A11Y-HEX-SWEPT
import {
  ComposedChart, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line,
  ReferenceLine, ReferenceArea,
} from 'recharts'
import Card from './Card'
import EmptyChart from './EmptyChart'
import CircularBarChart from './CircularBarChart'
import LollipopChart from './LollipopChart'
import { formatNumber, formatPercent, hlFill, hlStroke, clicked, topWithSel, selIn } from '../utils/format'

const SEXO_COR = { Masculino: '#0072B2', Feminino: '#CC79A7' }

export default function OverviewTab({ agg, filters, onToggle }) {
  const { timeseries, byCadeia, bySexo, byFaixaEtaria, seasonality } = agg
  const periodos = timeseries.map((t) => t.periodo)
  const topCadeias = topWithSel(byCadeia, 8, 'cadeia', filters.cadeia)
  const doAno = filters.ano ? periodos.filter((p) => p.startsWith(filters.ano)) : []
  const sexos = bySexo.filter((s) => s.sexo !== 'Não informado')
  const faixas = byFaixaEtaria.filter((f) => f.faixa !== 'Não informado')
  const hasSerie = timeseries.some((t) => t.admissoes || t.demissoes)
  const onMes = (e) => e?.activeLabel && onToggle('periodo', e.activeLabel)

  return (
    <div className="space-y-6">
      <Card title="Evolução Mensal do Emprego Agrícola (clique em um mês para filtrar)">
        <div className="h-80" style={{ minHeight: '320px' }}>
          {hasSerie ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={timeseries} onClick={onMes} style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} interval={5} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Legend />
                {filters.periodo && <ReferenceLine yAxisId="left" x={filters.periodo} stroke="#14110c" strokeWidth={2} />}
                {doAno.length > 0 && (
                  <ReferenceArea
                    yAxisId="left"
                    x1={doAno[0]}
                    x2={doAno[doAno.length - 1]}
                    fill="#0072B2" fillOpacity={0.08} stroke="#0072B2" strokeOpacity={0.4}
                  />
                )}
                <Bar yAxisId="left" dataKey="admissoes" name="Admissões" fill="#0072B2" opacity={0.8} />
                <Bar yAxisId="left" dataKey="demissoes" name="Demissões" fill="#D55E00" opacity={0.8} />
                <Line yAxisId="right" type="monotone" dataKey="saldo_acumulado" name="Saldo Acumulado" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Principais Cadeias Produtivas (clique para filtrar)">
          <div className="h-72" style={{ minHeight: '288px' }}>
            {topCadeias.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCadeias} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="cadeia" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatNumber(v)} />
                  <Bar dataKey="admissoes" name="Admissões" cursor="pointer" onClick={(d) => onToggle('cadeia', clicked(d, 'cadeia'))}>
                    {topCadeias.map((entry) => (
                      <Cell
                        key={entry.cadeia}
                        fill={hlFill(selIn(topCadeias, 'cadeia', filters.cadeia), entry.cadeia, '#0072B2')}
                        stroke={hlStroke(selIn(topCadeias, 'cadeia', filters.cadeia), entry.cadeia)}
                        strokeWidth={2}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </Card>

        <Card title="Distribuição por Sexo (clique para filtrar)">
          <div className="h-72 flex items-center">
            {sexos.some((s) => s.admissoes > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sexos}
                    dataKey="admissoes"
                    nameKey="sexo"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ sexo, pct }) => `${sexo}: ${formatPercent(pct)}`}
                    cursor="pointer"
                    onClick={(d) => onToggle('sexo', clicked(d, 'sexo'))}
                  >
                    {sexos.map((entry) => (
                      <Cell
                        key={entry.sexo}
                        fill={hlFill(selIn(sexos, 'sexo', filters.sexo), entry.sexo, SEXO_COR[entry.sexo] || '#999')}
                        stroke={hlStroke(selIn(sexos, 'sexo', filters.sexo), entry.sexo)}
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatNumber(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Distribuição por Faixa Etária (clique para filtrar)">
          <div className="h-64">
            {faixas.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={faixas}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="faixa" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatNumber(v)} />
                  <Bar dataKey="admissoes" name="Admissões" cursor="pointer" onClick={(d) => onToggle('faixa', clicked(d, 'faixa'))}>
                    {faixas.map((entry) => (
                      <Cell
                        key={entry.faixa}
                        fill={hlFill(selIn(faixas, 'faixa', filters.faixa), entry.faixa, '#CC79A7')}
                        stroke={hlStroke(selIn(faixas, 'faixa', filters.faixa), entry.faixa)}
                        strokeWidth={2}
                      />
                    ))}
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
            {seasonality.some((s) => s.admissoes || s.demissoes) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={seasonality}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes_nome" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatNumber(v)} />
                  <Area type="monotone" dataKey="admissoes" name="Admissões" fill="#0072B2" fillOpacity={0.3} stroke="#005c8e" />
                  <Area type="monotone" dataKey="demissoes" name="Demissões" fill="#D55E00" fillOpacity={0.3} stroke="#a8482c" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <CircularBarChart data={seasonality} title="Saldo Médio por Mês (média mensal)" width={400} height={400} metric="saldo" />
        <LollipopChart
          data={byCadeia}
          title="Ranking por Cadeia"
          width={500}
          height={400}
          metric="saldo"
          limit={10}
          selected={filters.cadeia}
          onCadeiaClick={(c) => onToggle('cadeia', c)}
        />
      </div>
    </div>
  )
}
