import Card from './Card'
import SortTh from './SortTh'
import { useSort, useStickyState } from '../utils/useSort'
import { formatNumber, formatCurrency, formatSigned, salTitle, sortRows } from '../utils/format'

const LIMITE = 100

// byCnae ignora o próprio filtro cnae: a linha filtrada continua visível (destacada).
function CnaeTab({ agg, filters, onToggle, onSet, cadeias }) {
  const [busca, setBusca] = useStickyState('cnae:busca', '')
  const sort = useSort('admissoes', 'desc', 'cnae')
  const q = busca.trim().toLowerCase()
  const filtered = agg.byCnae.filter(
    (c) => !q || c.cnae.includes(q) || c.descricao.toLowerCase().includes(q) || c.cadeia.toLowerCase().includes(q),
  )
  const rows = sortRows(filtered, sort.sortCol, sort.sortDir)

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap gap-4 mb-4">
          <input
            type="search"
            name="busca-cnae"
            placeholder="Buscar por código, descrição ou cadeia..."
            aria-label="Buscar atividade CNAE"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <select
            name="cadeia"
            value={filters.cadeia}
            onChange={(e) => onSet('cadeia', e.target.value)}
            aria-label="Filtrar por cadeia"
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Todas as cadeias</option>
            {cadeias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="text-xs text-neutral-500 self-center">Clique em uma linha para filtrar a atividade.</span>
        </div>

        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50">
              <tr className="border-b border-neutral-200">
                <SortTh col="cnae" label="CNAE" {...sort} />
                <SortTh col="descricao" label="Descrição" {...sort} />
                <SortTh col="cadeia" label="Cadeia" {...sort} />
                <SortTh col="admissoes" label="Admissões" align="right" {...sort} />
                <SortTh col="demissoes" label="Demissões" align="right" {...sort} />
                <SortTh col="saldo" label="Saldo" align="right" {...sort} />
                <SortTh col="salario_mediana" label="Mediana (estimada)" align="right" {...sort} />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, LIMITE).map((c) => (
                <tr
                  key={c.cnae}
                  className={`border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer ${c.cnae === filters.cnae ? 'bg-green-50 font-semibold' : ''}`}
                  onClick={() => onToggle('cnae', c.cnae)}
                  aria-selected={c.cnae === filters.cnae}
                >
                  <td className="py-2 px-2 font-mono text-xs">{c.cnae}</td>
                  <td className="py-2 px-2 text-xs max-w-[250px] truncate" title={c.descricao}>{c.descricao}</td>
                  <td className="py-2 px-2 text-xs">{c.cadeia}</td>
                  <td className="text-right py-2 px-2 text-sky-700">{formatNumber(c.admissoes)}</td>
                  <td className="text-right py-2 px-2 text-orange-700">{formatNumber(c.demissoes)}</td>
                  <td className={`text-right py-2 px-2 font-medium ${c.saldo >= 0 ? 'text-sky-700' : 'text-orange-700'}`}>{formatSigned(c.saldo)}</td>
                  <td className="text-right py-2 px-2" title={salTitle(c.salario_mediana)}>{formatCurrency(c.salario_mediana)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-neutral-400 py-6 text-center">Sem dados para exibir</p>}
          {rows.length > LIMITE && (
            <p className="text-sm text-neutral-500 mt-4 text-center">
              Mostrando {LIMITE} de {rows.length} atividades
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

export default CnaeTab
