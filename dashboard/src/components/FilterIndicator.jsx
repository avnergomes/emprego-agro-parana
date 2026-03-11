export default function FilterIndicator({ hasFilter, filterLabel, message = "Todos os graficos estao filtrados." }) {
  if (!hasFilter) return null
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 mb-4 text-sm text-green-700 flex items-center gap-2 transition-all duration-200">
      <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-green-500 flex-shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium">Filtro regional: {filterLabel}</span>
        <span className="text-green-600 ml-2">- {message}</span>
      </span>
    </div>
  )
}
