// ATLAS-A11Y-HEX-SWEPT
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import Card from './Card'
import EmptyChart from './EmptyChart'
import { formatNumber, formatCurrency, formatPercent, salTitle, hlFill, hlStroke, clicked, selIn } from '../utils/format'

const SEXO_COR = { Masculino: 'bg-[#0072B2]', Feminino: 'bg-[#CC79A7]' }

function Resumo({ label, value, color, title }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className={`text-2xl font-bold ${color}`} title={title}>{value}</div>
    </div>
  )
}

// Barras horizontais clicáveis de uma dimensão categórica (ordem de dims).
function DimBars({ data, dim, filterValue, onClick, color, width = 110 }) {
  if (!data.some((d) => d.admissoes > 0)) return <EmptyChart />
  const sel = selIn(data, dim, filterValue) // selecionado sem linha no recorte: não acinzenta tudo
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis dataKey={dim} type="category" width={width} tick={{ fontSize: 10 }} interval={0} />
        <Tooltip formatter={(v) => formatNumber(v)} />
        <Bar dataKey="admissoes" name="Admissões" cursor="pointer" onClick={(d) => onClick(clicked(d, dim))}>
          {data.map((entry) => (
            <Cell key={entry[dim]} fill={hlFill(sel, entry[dim], color)} stroke={hlStroke(sel, entry[dim])} strokeWidth={2} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function PerfilTab({ agg, filters, onToggle, porteIndisponivel = [] }) {
  const { kpis, bySexo, byFaixaEtaria, byEscolaridade, byPorte } = agg
  const masc = kpis.perfil.pct_masculino
  const idade = kpis.perfil.idade_media

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Resumo label="% Masculino" value={formatPercent(masc)} color="text-sky-700" />
        <Resumo label="% Feminino" value={masc == null ? '—' : formatPercent(Math.round((100 - masc) * 10) / 10)} color="text-pink-700" />
        <Resumo label="Idade média dos admitidos" value={idade == null ? '—' : `${idade.toLocaleString('pt-BR')} anos`} color="text-purple-700" />
        <Resumo
          label="Mediana salarial (estimada)"
          value={formatCurrency(kpis.salario.mediana)}
          title={salTitle(kpis.salario.mediana)}
          color="text-amber-700"
        />
      </div>
      <p className="text-xs text-neutral-500 -mt-3">
        Percentuais sobre admissões com sexo informado. Mediana estimada por interpolação nas faixas salariais.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Por Sexo (clique para filtrar)">
          <div className="space-y-4">
            {bySexo.filter((s) => s.sexo !== 'Não informado').map((s) => (
              <button
                type="button"
                key={s.sexo}
                className={`w-full flex items-center gap-4 cursor-pointer p-2 rounded-lg transition-colors text-left ${s.sexo === filters.sexo ? 'bg-blue-50 ring-2 ring-neutral-800' : 'hover:bg-neutral-50'}`}
                onClick={() => onToggle('sexo', s.sexo)}
                aria-pressed={s.sexo === filters.sexo}
              >
                <span className="w-24 text-sm font-medium">{s.sexo}</span>
                <span className="flex-1 bg-neutral-100 rounded-full h-6 overflow-hidden">
                  <span
                    className={`block h-full ${filters.sexo && filters.sexo !== s.sexo ? 'bg-slate-300' : SEXO_COR[s.sexo]}`}
                    style={{ width: `${s.pct}%` }}
                  />
                </span>
                <span className="w-28 text-right text-sm">
                  <span className="font-bold">{formatPercent(s.pct)}</span>
                  <span className="text-neutral-400 ml-1">({formatNumber(s.admissoes)})</span>
                </span>
              </button>
            ))}
            {bySexo.length === 0 && <div className="h-24"><EmptyChart /></div>}
          </div>
        </Card>

        <Card title="Por Faixa Etária (clique para filtrar)">
          <div className="h-64">
            <DimBars
              data={byFaixaEtaria.filter((f) => f.faixa !== 'Não informado')}
              dim="faixa"
              filterValue={filters.faixa}
              onClick={(v) => onToggle('faixa', v)}
              color="#CC79A7"
              width={100}
            />
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Por Escolaridade (clique para filtrar)">
          <div className="h-80">
            <DimBars
              data={byEscolaridade}
              dim="escolaridade"
              filterValue={filters.escolaridade}
              onClick={(v) => onToggle('escolaridade', v)}
              color="#009E73"
              width={140}
            />
          </div>
        </Card>

        <Card title="Por Porte da Empresa (clique para filtrar)">
          <div className="h-80">
            <DimBars
              data={byPorte}
              dim="porte"
              filterValue={filters.porte}
              onClick={(v) => onToggle('porte', v)}
              color="#c89b3c"
              width={110}
            />
          </div>
          {porteIndisponivel.length > 0 && (
            <p className="text-xs text-neutral-500 mt-2" data-i18n-translate>
              Porte do estabelecimento não informado pelo MTE em {porteIndisponivel.join(', ')}: nessas competências tudo cai em "Não informado"; com filtro de porte elas ficam fora do recorte.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}

export default PerfilTab
