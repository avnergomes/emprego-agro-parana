export default function ActiveFilters({ filters, onClear, onClearAll }) {
  const labels = {
    cadeia: 'Cadeia',
    sexo: 'Sexo',
    faixa: 'Faixa Etaria',
    escolaridade: 'Escolaridade',
    periodo: 'Periodo'
  }
  const active = Object.entries(filters).filter(([_, v]) => v)
  if (!active.length) return null

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 transition-all duration-200">
      <span className="text-sm text-green-700 font-medium flex items-center gap-1.5">
        Filtros por clique
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold">
          {active.length}
        </span>
      </span>
      {active.map(([key, value]) => (
        <span
          key={key}
          className="active-filter-badge"
        >
          {labels[key]}: {value}
          <button
            onClick={() => onClear(key)}
            title="Remover filtro"
            aria-label={`Remover filtro ${labels[key]}`}
          >
            ×
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="px-3 py-1 text-red-600 text-sm hover:bg-red-50 rounded-lg transition-colors duration-150 ml-auto"
      >
        Limpar todos
      </button>
    </div>
  )
}
