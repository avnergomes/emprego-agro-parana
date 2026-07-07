export default function KpiCard({ title, value, subtitle, icon: Icon, color, loading }) {
  const colors = {
    green: 'border-green-500 bg-green-50',
    red: 'border-red-500 bg-red-50',
    amber: 'border-amber-500 bg-amber-50',
    blue: 'border-blue-500 bg-blue-50',
    // Par daltônico-seguro (mesma semântica dos gráficos Okabe-Ito):
    // azul para admissões, laranja para demissões.
    sky: 'border-sky-700 bg-sky-50',
    orange: 'border-orange-700 bg-orange-50',
  }
  const iconColors = {
    green: 'text-green-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
    sky: 'text-sky-700',
    orange: 'text-orange-700',
  }

  const isLoading = loading || value == null

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${colors[color]} p-4 transition-shadow duration-200 hover:shadow-md`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-neutral-500">{title}</span>
        <Icon className={`w-5 h-5 ${iconColors[color]}`} />
      </div>
      {isLoading ? (
        <>
          <div className="skeleton h-8 w-3/4 mb-2" />
          <div className="skeleton h-3 w-1/2" />
        </>
      ) : (
        <>
          <div className="text-2xl font-bold text-neutral-800">{value}</div>
          <div className="text-xs text-neutral-500 mt-1">{subtitle}</div>
        </>
      )}
    </div>
  )
}
