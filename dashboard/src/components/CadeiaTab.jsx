// ATLAS-A11Y-HEX-SWEPT
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Treemap,
} from 'recharts'
import Card from './Card'
import EmptyChart from './EmptyChart'
import BumpChart from './BumpChart'
import SortTh from './SortTh'
import { useSort } from '../utils/useSort'
import { formatNumber, formatCurrency, formatPercent, formatSigned, salTitle, sortRows, NEUTRAL, topWithSel, selIn } from '../utils/format'

// Célula do treemap (fora do render da aba).
function TreemapCell({ x, y, width, height, name, fill, isSelected }) {
  return (
    <g style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke={isSelected ? '#14110c' : '#fff'} strokeWidth={isSelected ? 3 : 2} />
      {width > 60 && height > 30 && (
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#fff" fontSize={12} fontWeight="bold">
          {name}
        </text>
      )}
    </g>
  )
}

function CadeiaTab({ agg, filters, onToggle, cores }) {
  const { byCadeia, timeseriesCadeia, crossCadeiaSexo } = agg
  const sel = filters.cadeia
  const top10 = topWithSel(byCadeia, 10, 'cadeia', sel)
  const selTop = selIn(top10, 'cadeia', sel) // sem linha no recorte: não acinzenta tudo
  const sort = useSort('admissoes', 'desc', 'cadeia')
  const rows = sortRows(byCadeia, sort.sortCol, sort.sortDir)

  // crossCadeiaSexo ignora cadeia/cnae/sexo: participação de cada sexo nas admissões da cadeia
  const genero = top10.map((c) => {
    const adm = (sexo) => crossCadeiaSexo.find((x) => x.cadeia === c.cadeia && x.sexo === sexo)?.admissoes || 0
    const m = adm('Masculino')
    const f = adm('Feminino')
    const t = m + f
    return { cadeia: c.cadeia, masculino: t > 0 ? Math.round((m / t) * 1000) / 10 : 0, feminino: t > 0 ? Math.round((f / t) * 1000) / 10 : 0 }
  })

  return (
    <div className="space-y-6">
      <Card title="Distribuição por Cadeia Produtiva (clique para filtrar)">
        <div className="h-80">
          {top10.some((c) => c.admissoes > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={top10.filter((c) => c.admissoes > 0).map((c) => ({
                  name: c.cadeia,
                  size: c.admissoes,
                  fill: selTop && selTop !== c.cadeia ? NEUTRAL : c.cor,
                  isSelected: c.cadeia === sel,
                }))}
                dataKey="size"
                aspectRatio={4 / 3}
                stroke="#fff"
                onClick={(node) => onToggle('cadeia', node.name)}
                content={<TreemapCell />}
              />
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </Card>

      <Card title="Detalhamento por Cadeia Produtiva (clique no cabeçalho para ordenar, na linha para filtrar)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <SortTh col="cadeia" label="Cadeia" {...sort} />
                <SortTh col="admissoes" label="Admissões" align="right" {...sort} />
                <SortTh col="demissoes" label="Demissões" align="right" {...sort} />
                <SortTh col="saldo" label="Saldo" align="right" {...sort} />
                <SortTh col="salario_medio" label="Salário Médio" align="right" {...sort} />
                <SortTh col="pct_admissoes" label="%" align="right" {...sort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.cadeia}
                  className={`border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer ${c.cadeia === sel ? 'bg-green-50 font-semibold' : ''}`}
                  onClick={() => onToggle('cadeia', c.cadeia)}
                  aria-selected={c.cadeia === sel}
                >
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.cor }} />
                      {c.cadeia}
                    </div>
                  </td>
                  <td className="text-right py-2 px-2 text-sky-700">{formatNumber(c.admissoes)}</td>
                  <td className="text-right py-2 px-2 text-orange-700">{formatNumber(c.demissoes)}</td>
                  <td className={`text-right py-2 px-2 font-medium ${c.saldo >= 0 ? 'text-sky-700' : 'text-orange-700'}`}>{formatSigned(c.saldo)}</td>
                  <td className="text-right py-2 px-2" title={salTitle(c.salario_medio)}>{formatCurrency(c.salario_medio)}</td>
                  <td className="text-right py-2 px-2 text-neutral-500">{formatPercent(c.pct_admissoes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="h-24"><EmptyChart /></div>}
        </div>
      </Card>

      <Card title="Distribuição de Gênero por Cadeia">
        <div className="h-80">
          {genero.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={genero} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis dataKey="cadeia" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend />
                <Bar dataKey="masculino" name="Masculino" stackId="a" fill="#0072B2" />
                <Bar dataKey="feminino" name="Feminino" stackId="a" fill="#CC79A7" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </Card>

      {/* timeseriesCadeia aplica cadeia/cnae: com eles só sobra uma cadeia, sempre em #1 */}
      {filters.cadeia || filters.cnae ? (
        <Card title="Evolução do Ranking de Cadeias">
          <div className="h-24 flex items-center justify-center text-neutral-500 text-sm text-center px-4" data-i18n-translate>
            Ranking indisponível com cadeia ou atividade filtrada; limpe o filtro para comparar cadeias.
          </div>
        </Card>
      ) : (
        <BumpChart data={timeseriesCadeia} cores={cores} title="Evolução do Ranking de Cadeias" width={800} height={450} metric="saldo" topN={10} />
      )}
    </div>
  )
}

export default CadeiaTab
