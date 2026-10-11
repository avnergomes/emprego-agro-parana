// ATLAS-A11Y-HEX-SWEPT
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import Card from './Card'
import EmptyChart from './EmptyChart'
import SortTh from './SortTh'
import { useSort } from '../utils/useSort'
import { formatCurrency, salTitle, sortRows, hlFill, hlStroke, clicked, SAL_NULL_TITLE, topWithSel, selIn } from '../utils/format'

const tickReais = (v) => `R$ ${v.toLocaleString('pt-BR')}`

// Percentis vêm do motor (estimados por bins); salário com n_sal < 5 chega null e
// sai do gráfico (sem exclusões fixas por cadeia).
function SalarioTab({ agg, filters, onToggle }) {
  const { salaryDistribution, byEscolaridade } = agg
  const sort = useSort('p50', 'desc', 'salario')
  const barras = topWithSel(sortRows(salaryDistribution.filter((s) => s.p50 != null), 'p50', 'desc'), 12, 'cadeia', filters.cadeia)
  const selCad = selIn(barras, 'cadeia', filters.cadeia)
  const tabela = sortRows(salaryDistribution, sort.sortCol, sort.sortDir)
  const porEsc = byEscolaridade.filter((e) => e.salario_medio != null)
  const selEsc = selIn(porEsc, 'escolaridade', filters.escolaridade)

  return (
    <div className="space-y-6">
      <Card title="Salário Mediano por Cadeia, estimado (clique para filtrar)">
        <div className="h-80">
          {barras.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barras} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={tickReais} />
                <YAxis dataKey="cadeia" type="category" width={140} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="p50" name="Mediana (estimada)" cursor="pointer" onClick={(d) => onToggle('cadeia', clicked(d, 'cadeia'))}>
                  {barras.map((entry) => (
                    <Cell
                      key={entry.cadeia}
                      fill={hlFill(selCad, entry.cadeia, '#0072B2')}
                      stroke={hlStroke(selCad, entry.cadeia)}
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

      <Card title="Percentis Salariais por Cadeia, estimados (clique no cabeçalho para ordenar, na linha para filtrar)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <SortTh col="cadeia" label="Cadeia" {...sort} />
                <SortTh col="p10" label="P10" align="right" {...sort} />
                <SortTh col="p25" label="P25" align="right" {...sort} />
                <SortTh col="p50" label="Mediana" align="right" {...sort} />
                <SortTh col="p75" label="P75" align="right" {...sort} />
                <SortTh col="p90" label="P90" align="right" {...sort} />
                <SortTh col="mean" label="Média" align="right" {...sort} />
                <SortTh col="n_sal" label="Admissões na regra" align="right" {...sort} />
              </tr>
            </thead>
            <tbody>
              {tabela.map((s) => (
                <tr
                  key={s.cadeia}
                  className={`border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer ${s.cadeia === filters.cadeia ? 'bg-green-50' : ''}`}
                  onClick={() => onToggle('cadeia', s.cadeia)}
                  aria-selected={s.cadeia === filters.cadeia}
                >
                  <td className="py-2 px-2 font-medium">{s.cadeia}</td>
                  {['p10', 'p25', 'p50', 'p75', 'p90', 'mean'].map((k) => (
                    <td
                      key={k}
                      className={`text-right py-2 px-2 ${k === 'p50' ? 'font-bold text-neutral-900' : 'text-neutral-600'}`}
                      title={salTitle(s[k])}
                    >
                      {formatCurrency(s[k])}
                    </td>
                  ))}
                  <td className="text-right py-2 px-2 text-neutral-500">{s.n_sal.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tabela.length === 0 && <p className="text-sm text-neutral-400 py-6 text-center">Sem dados para exibir</p>}
        </div>
        <p className="text-xs text-neutral-500 mt-3" data-i18n-translate>
          Percentis estimados por interpolação linear nas faixas salariais. Regra MTE: admissões não intermitentes entre 0,3 e 150 salários mínimos.
        </p>
        <p className="text-xs text-neutral-500 mt-1">{`— = ${SAL_NULL_TITLE}`}</p>
      </Card>

      <Card title="Salário Médio por Escolaridade (clique para filtrar)">
        <div className="h-72">
          {porEsc.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porEsc}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="escolaridade" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={90} interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={tickReais} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="salario_medio" name="Salário Médio" cursor="pointer" onClick={(d) => onToggle('escolaridade', clicked(d, 'escolaridade'))}>
                  {porEsc.map((entry) => (
                    <Cell
                      key={entry.escolaridade}
                      fill={hlFill(selEsc, entry.escolaridade, '#c89b3c')}
                      stroke={hlStroke(selEsc, entry.escolaridade)}
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
    </div>
  )
}

export default SalarioTab
