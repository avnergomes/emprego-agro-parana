// Lista TODOS os filtros ativos (regionais, cadeia, cnae, período e perfil),
// com remoção individual e "Limpar tudo". `items` vem de activeFilters().
export default function ActiveFilters({ items, onClear, onClearAll }) {
  if (!items.length) return null

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 transition-all duration-200" data-i18n-translate>
      <span className="text-sm text-green-700 font-medium flex items-center gap-1.5">
        <span>Filtros ativos</span>
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold">
          {items.length}
        </span>
      </span>
      {items.map(({ key, label, value }) => (
        <span key={key} className="active-filter-badge">
          <span>{label}</span>: <span data-i18n-skip>{value}</span>
          <button onClick={() => onClear(key)} title="Remover filtro" aria-label="Remover filtro">
            ×
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="px-3 py-1 min-h-[32px] text-red-600 text-sm hover:bg-red-50 rounded-lg transition-colors duration-150 ml-auto"
      >
        Limpar tudo
      </button>
    </div>
  )
}
