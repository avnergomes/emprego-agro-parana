// ATLAS-A11Y-HEX-SWEPT
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import Card from './Card'
import FilterIndicator from './FilterIndicator'

// Formatadores
const formatNumber = (n) => n?.toLocaleString('pt-BR') || '0'
const formatCurrency = (n) => `R$ ${n?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` || 'R$ 0,00'

function PerfilTab({ bySexo, byFaixaEtaria, byEscolaridade, byPorte, kpis, hasFilter, filterLabel, onSexoClick, onFaixaClick, onEscolaridadeClick, sexoFilter, faixaFilter, escolaridadeFilter }) {
  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">% Masculino</div>
          <div className="text-2xl font-bold text-blue-600">{kpis.perfil.pct_masculino}%</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">% Feminino</div>
          <div className="text-2xl font-bold text-pink-600">{(100 - kpis.perfil.pct_masculino).toFixed(1)}%</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Idade Média</div>
          <div className="text-2xl font-bold text-purple-600">{kpis.perfil.idade_media} anos</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Salário Médio</div>
          <div className="text-2xl font-bold text-amber-600">{formatCurrency(kpis.salario.media)}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Sexo - Clicável */}
        <Card title="Por Sexo (clique para filtrar)">
          <div className="space-y-4">
            {bySexo.filter(s => s.sexo !== 'Não informado').map(s => (
              <div
                key={s.sexo}
                className={`flex items-center gap-4 cursor-pointer p-2 rounded-lg transition-colors ${s.sexo === sexoFilter ? 'bg-blue-50 ring-2 ring-blue-300' : 'hover:bg-neutral-50'}`}
                onClick={() => onSexoClick && onSexoClick(s.sexo)}
              >
                <div className="w-24 text-sm font-medium">{s.sexo}</div>
                <div className="flex-1 bg-neutral-100 rounded-full h-6 overflow-hidden">
                  <div
                    className={`h-full ${s.sexo === 'Masculino' ? 'bg-blue-500' : 'bg-pink-500'}`}
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
                <div className="w-20 text-right text-sm">
                  <span className="font-bold">{s.pct}%</span>
                  <span className="text-neutral-400 ml-1">({formatNumber(s.admissoes)})</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Faixa Etária - Clicável */}
        <Card title="Por Faixa Etária (clique para filtrar)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byFaixaEtaria.filter(f => f.faixa !== 'Não informado')} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="faixa" type="category" width={100} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar
                  dataKey="admissoes"
                  cursor="pointer"
                  onClick={(data) => onFaixaClick && onFaixaClick(data.faixa)}
                >
                  {byFaixaEtaria.filter(f => f.faixa !== 'Não informado').map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.faixa === faixaFilter ? '#6d28d9' : '#CC79A7'}
                      stroke={entry.faixa === faixaFilter ? '#5b21b6' : 'none'}
                      strokeWidth={entry.faixa === faixaFilter ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Escolaridade - Clicável */}
        <Card title="Por Escolaridade (clique para filtrar)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byEscolaridade.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="escolaridade" type="category" width={130} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar
                  dataKey="admissoes"
                  cursor="pointer"
                  onClick={(data) => onEscolaridadeClick && onEscolaridadeClick(data.escolaridade)}
                >
                  {byEscolaridade.slice(0, 8).map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.escolaridade === escolaridadeFilter ? '#0891b2' : '#06b6d4'}
                      stroke={entry.escolaridade === escolaridadeFilter ? '#0e7490' : 'none'}
                      strokeWidth={entry.escolaridade === escolaridadeFilter ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Porte da empresa */}
        <Card title="Por Porte da Empresa">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPorte}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="porte" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar dataKey="admissoes" fill="#c89b3c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default PerfilTab
