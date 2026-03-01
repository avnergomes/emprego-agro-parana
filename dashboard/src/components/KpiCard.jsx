export default function KpiCard({ title, value, subtitle, icon: Icon, color }) {
  const colors = {
    green: 'border-green-500 bg-green-50',
    red: 'border-red-500 bg-red-50',
    amber: 'border-amber-500 bg-amber-50',
    blue: 'border-blue-500 bg-blue-50',
  }
  const iconColors = {
    green: 'text-green-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${colors[color]} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-neutral-500">{title}</span>
        <Icon className={`w-5 h-5 ${iconColors[color]}`} />
      </div>
      <div className="text-2xl font-bold text-neutral-800">{value}</div>
      <div className="text-xs text-neutral-500 mt-1">{subtitle}</div>
    </div>
  )
}
