export default function FilterIndicator({ hasFilter, filterLabel, message = "Todos os gráficos estão filtrados." }) {
  if (!hasFilter) return null
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-4 text-sm text-green-700">
      <span className="font-medium">Filtro regional: {filterLabel}</span>
      <span className="text-green-600 ml-2">- {message}</span>
    </div>
  )
}
