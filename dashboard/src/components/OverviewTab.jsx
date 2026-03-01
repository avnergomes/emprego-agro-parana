import {
  ComposedChart, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line
} from 'recharts'
import Card from './Card'
import FilterIndicator from './FilterIndicator'
import CircularBarChart from './CircularBarChart'
import LollipopChart from './LollipopChart'

const formatNumber = (n) => n?.toLocaleString('pt-BR') || '0'

export default function OverviewTab({ timeseries, byCadeia, bySexo, byFaixaEtaria, seasonality, hasFilter, filterLabel, onCadeiaClick, onSexoClick, onFaixaClick, cadeiaFilter, sexoFilter, faixaFilter }) {
  const hasData = timeseries?.length > 0

  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {/* Série Temporal */}
      <Card title="Evolução Mensal do Emprego Agrícola">
        <div className="h-80" style={{ minHeight: '320px' }}>
          {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={timeseries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11 }} interval={5} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatNumber(v)} />
              <Legend />
              <Bar yAxisId="left" dataKey="admissoes" name="Admissões" fill="#22c55e" opacity={0.8} />
              <Bar yAxisId="left" dataKey="demissoes" name="Demissões" fill="#ef4444" opacity={0.8} />
              <Line yAxisId="right" type="monotone" dataKey="saldo_acumulado" name="Saldo Acumulado" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400">Sem dados para exibir</div>
          )}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Cadeias - Clicável */}
        <Card title="Principais Cadeias Produtivas (clique para filtrar)">
          <div className="h-72" style={{ minHeight: '288px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCadeia.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="cadeia" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar
                  dataKey="admissoes"
                  name="Admissões"
                  cursor="pointer"
                  onClick={(data) => onCadeiaClick && onCadeiaClick(data.cadeia)}
                >
                  {byCadeia.slice(0, 8).map((entry, index) => (
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

        {/* Distribuição por Sexo - Clicável */}
        <Card title="Distribuição por Sexo (clique para filtrar)">
          <div className="h-72 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={bySexo.filter(s => s.sexo !== 'Não informado')}
                  dataKey="admissoes"
                  nameKey="sexo"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ sexo, pct }) => `${sexo}: ${pct}%`}
                  cursor="pointer"
                  onClick={(data) => onSexoClick && onSexoClick(data.sexo)}
                >
                  {bySexo.filter(s => s.sexo !== 'Não informado').map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.sexo === sexoFilter
                        ? (entry.sexo === 'Masculino' ? '#1d4ed8' : '#be185d')
                        : (entry.sexo === 'Masculino' ? '#3b82f6' : '#ec4899')
                      }
                      stroke={entry.sexo === sexoFilter ? '#000' : 'none'}
                      strokeWidth={entry.sexo === sexoFilter ? 2 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatNumber(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Faixa Etária - Clicável */}
        <Card title="Distribuição por Faixa Etária (clique para filtrar)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byFaixaEtaria.filter(f => f.faixa !== 'Não informado')}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="faixa" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar
                  dataKey="admissoes"
                  name="Admissões"
                  cursor="pointer"
                  onClick={(data) => onFaixaClick && onFaixaClick(data.faixa)}
                >
                  {byFaixaEtaria.filter(f => f.faixa !== 'Não informado').map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.faixa === faixaFilter ? '#6d28d9' : '#8b5cf6'}
                      stroke={entry.faixa === faixaFilter ? '#5b21b6' : 'none'}
                      strokeWidth={entry.faixa === faixaFilter ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Sazonalidade */}
        <Card title="Padrão Sazonal (Média Mensal)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={seasonality}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes_nome" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Area type="monotone" dataKey="admissoes" name="Admissões" fill="#22c55e" fillOpacity={0.3} stroke="#16a34a" />
                <Area type="monotone" dataKey="demissoes" name="Demissões" fill="#ef4444" fillOpacity={0.3} stroke="#dc2626" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* D3 Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <CircularBarChart
          data={timeseries}
          title="Padrão Sazonal de Emprego"
          width={400}
          height={400}
          metric="saldo"
        />
        <LollipopChart
          data={byCadeia}
          title="Ranking por Cadeia"
          width={500}
          height={400}
          metric="saldo"
          limit={10}
          onCadeiaClick={onCadeiaClick}
        />
      </div>
    </div>
  )
}
