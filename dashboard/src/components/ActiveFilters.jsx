export default function ActiveFilters({ filters, onClear, onClearAll }) {
  const labels = {
    cadeia: 'Cadeia',
    sexo: 'Sexo',
    faixa: 'Faixa Etária',
    escolaridade: 'Escolaridade',
    periodo: 'Período'
  }
  const active = Object.entries(filters).filter(([_, v]) => v)
  if (!active.length) return null

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
      <span className="text-sm text-blue-700 font-medium">Filtros por clique:</span>
      {active.map(([key, value]) => (
        <span
          key={key}
          className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-1"
        >
          {labels[key]}: {value}
          <button
            onClick={() => onClear(key)}
            className="ml-1 hover:text-red-600 font-bold"
            title="Remover filtro"
          >
            ×
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="px-3 py-1 text-red-600 text-sm hover:underline ml-2"
      >
        Limpar todos
      </button>
    </div>
  )
}
