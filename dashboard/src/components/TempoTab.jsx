import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell
} from 'recharts'
import Card from './Card'
import FilterIndicator from './FilterIndicator'

// Formatadores
const formatNumber = (n) => n?.toLocaleString('pt-BR') || '0'

function TempoTab({ timeseries, yearly, seasonality, hasFilter, filterLabel, onPeriodoClick, periodoFilter }) {
  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {periodoFilter && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          <span className="font-medium">Período selecionado: {periodoFilter}</span>
          <button
            onClick={() => onPeriodoClick && onPeriodoClick(periodoFilter)}
            className="ml-2 text-red-600 hover:underline"
          >
            Limpar
          </button>
        </div>
      )}
      {/* Série temporal completa */}
      <Card title="Série Histórica Completa (2020-2025)">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeseries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11 }} interval={5} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatNumber(v)} />
              <Legend />
              <Area type="monotone" dataKey="admissoes" name="Admissões" fill="#22c55e" fillOpacity={0.3} stroke="#16a34a" />
              <Area type="monotone" dataKey="demissoes" name="Demissões" fill="#ef4444" fillOpacity={0.3} stroke="#dc2626" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Saldo acumulado */}
      <Card title="Saldo Acumulado">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeseries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11 }} interval={5} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatNumber(v)} />
              <Line type="monotone" dataKey="saldo_acumulado" name="Saldo Acumulado" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Anual - Clicável */}
        <Card title="Resumo Anual (clique para filtrar por ano)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Legend />
                <Bar
                  dataKey="admissoes"
                  name="Admissões"
                  cursor="pointer"
                  onClick={(data) => {
                    // Filtrar por ano (todos os meses daquele ano)
                    const ano = String(data.ano)
                    const currentAno = periodoFilter ? periodoFilter.slice(0, 4) : ''
                    if (currentAno === ano) {
                      onPeriodoClick && onPeriodoClick('')
                    } else {
                      onPeriodoClick && onPeriodoClick(`${ano}-01`)
                    }
                  }}
                >
                  {yearly.map((entry, index) => {
                    const isSelected = periodoFilter && periodoFilter.startsWith(String(entry.ano))
                    return (
                      <Cell
                        key={`cell-adm-${index}`}
                        fill={isSelected ? '#15803d' : '#22c55e'}
                        stroke={isSelected ? '#166534' : 'none'}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                    )
                  })}
                </Bar>
                <Bar dataKey="demissoes" name="Demissões">
                  {yearly.map((entry, index) => {
                    const isSelected = periodoFilter && periodoFilter.startsWith(String(entry.ano))
                    return (
                      <Cell
                        key={`cell-dem-${index}`}
                        fill={isSelected ? '#b91c1c' : '#ef4444'}
                        stroke={isSelected ? '#991b1b' : 'none'}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Sazonalidade */}
        <Card title="Padrão Sazonal">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={seasonality}>
                <PolarGrid />
                <PolarAngleAxis dataKey="mes_nome" tick={{ fontSize: 11 }} />
                <Radar name="Índice Sazonal" dataKey="indice" stroke="#16a34a" fill="#22c55e" fillOpacity={0.5} />
                <Tooltip formatter={(v) => `${v}%`} />
              </RadarChart>
            </ResponsiveContainer>
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
