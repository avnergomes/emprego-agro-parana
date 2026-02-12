import { useMemo } from 'react'
import * as d3 from 'd3'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function CircularBarChart({
  data,
  title = "Padrao Sazonal de Emprego",
  width = 400,
  height = 400,
  metric = 'saldo' // 'admissoes', 'demissoes', 'saldo'
}) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null

    // Group by month
    const byMonth = {}
    data.forEach(item => {
      const month = parseInt(item.periodo?.split('-')[1], 10)
      if (!month || month < 1 || month > 12) return

      if (!byMonth[month]) {
        byMonth[month] = { sum: 0, count: 0 }
      }
      byMonth[month].sum += item[metric] || 0
      byMonth[month].count++
    })

    const monthlyData = MONTHS.map((name, i) => {
      const monthNum = i + 1
      const monthData = byMonth[monthNum]
      return {
        month: name,
        monthNum,
        value: monthData ? monthData.sum / monthData.count : 0
      }
    }).filter(d => d.value !== 0)

    if (monthlyData.length === 0) return null

    const avgValue = monthlyData.reduce((sum, d) => sum + d.value, 0) / monthlyData.length
    const maxValue = Math.max(...monthlyData.map(d => Math.abs(d.value)))
    const hasNegative = monthlyData.some(d => d.value < 0)

    return { data: monthlyData, avgValue, maxValue, hasNegative }
  }, [data, metric])

  if (!chartData) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-700 mb-4">{title}</h3>
        <div className="h-64 flex items-center justify-center text-dark-400">
          Sem dados sazonais disponiveis
        </div>
      </div>
    )
  }

  const { data: monthlyData, avgValue, maxValue, hasNegative } = chartData
  const centerX = width / 2
  const centerY = height / 2
  const innerRadius = 50
  const outerRadius = Math.min(width, height) / 2 - 50

  // Scales
  const xScale = d3.scaleBand()
    .domain(monthlyData.map(d => d.month))
    .range([0, 2 * Math.PI])
    .padding(0.15)

  const yScale = d3.scaleRadial()
    .domain([0, maxValue * 1.2])
    .range([innerRadius, outerRadius])

  // Arc generator
  const arcGenerator = d3.arc()

  // Grid levels
  const gridLevels = [0.25, 0.5, 0.75, 1.0]

  const formatValue = (v) => {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}K`
    return v.toFixed(0)
  }

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-dark-700 mb-4">{title}</h3>

      <svg width={width} height={height} className="mx-auto">
        <g transform={`translate(${centerX}, ${centerY})`}>
          {/* Grid circles */}
          {gridLevels.map((level, i) => (
            <circle
              key={i}
              r={innerRadius + (outerRadius - innerRadius) * level}
              fill="none"
              stroke="#e2e8f0"
              strokeDasharray="4,4"
            />
          ))}

          {/* Inner circle */}
          <circle
            r={innerRadius}
            fill="#f8fafc"
            stroke="#e2e8f0"
            strokeWidth={1}
          />

          {/* Average line */}
          {avgValue > 0 && (
            <circle
              r={yScale(Math.abs(avgValue))}
              fill="none"
              stroke="#64748b"
              strokeWidth={1}
              strokeDasharray="6,3"
            />
          )}

          {/* Grid labels */}
          {gridLevels.map((level, i) => (
            <text
              key={i}
              x={4}
              y={-(innerRadius + (outerRadius - innerRadius) * level)}
              fill="#94a3b8"
              fontSize={9}
              alignmentBaseline="middle"
            >
              {formatValue(maxValue * level)}
            </text>
          ))}

          {/* Bars */}
          {monthlyData.map((d, i) => {
            const absValue = Math.abs(d.value)
            const arcPath = arcGenerator({
              innerRadius: innerRadius,
              outerRadius: yScale(absValue),
              startAngle: xScale(d.month),
              endAngle: xScale(d.month) + xScale.bandwidth()
            })

            // Label position
            const midAngle = xScale(d.month) + xScale.bandwidth() / 2 - Math.PI / 2
            const labelRadius = outerRadius + 20
            const labelX = labelRadius * Math.cos(midAngle)
            const labelY = labelRadius * Math.sin(midAngle)

            const isPositive = d.value >= 0
            const color = isPositive ? '#22c55e' : '#ef4444'
            const isAboveAvg = absValue > Math.abs(avgValue)

            return (
              <g key={d.month} className="group cursor-pointer">
                <path
                  d={arcPath}
                  fill={color}
                  fillOpacity={isAboveAvg ? 0.85 : 0.5}
                  stroke="white"
                  strokeWidth={1}
                  className="transition-all group-hover:fill-opacity-100"
                >
                  <title>
                    {`${d.month}\n${metric}: ${formatValue(d.value)}\n${isAboveAvg ? 'Acima' : 'Abaixo'} da media`}
                  </title>
                </path>

                {/* Month label */}
                <text
                  x={labelX}
                  y={labelY}
                  fill="#475569"
                  fontSize={11}
                  fontWeight="500"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                >
                  {d.month}
                </text>
              </g>
            )
          })}

          {/* Center text */}
          <text
            x={0}
            y={-8}
            fill="#334155"
            fontSize={11}
            fontWeight="bold"
            textAnchor="middle"
          >
            Media
          </text>
          <text
            x={0}
            y={10}
            fill="#64748b"
            fontSize={12}
            fontFamily="monospace"
            textAnchor="middle"
          >
            {formatValue(avgValue)}
          </text>
        </g>
      </svg>

      {/* Legend */}
      <div className="mt-4 flex justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span className="text-dark-600">Positivo</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-500" />
          <span className="text-dark-600">Negativo</span>
        </div>
      </div>
    </div>
  )
}
