import { useMemo } from 'react'
import * as d3 from 'd3'

const MARGIN = { top: 20, right: 80, bottom: 20, left: 140 }

export default function LollipopChart({
  data,
  title = "Ranking por Cadeia",
  width = 500,
  height = 450,
  metric = 'saldo', // 'admissoes', 'demissoes', 'saldo', 'salario_medio'
  limit = 12,
  onCadeiaClick
}) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null

    const sorted = [...data]
      .sort((a, b) => Math.abs(b[metric] || 0) - Math.abs(a[metric] || 0))
      .slice(0, limit)

    const maxValue = Math.max(...sorted.map(d => Math.abs(d[metric] || 0)))
    const minValue = Math.min(...sorted.map(d => d[metric] || 0))
    const hasNegative = minValue < 0

    return { items: sorted, maxValue, minValue, hasNegative }
  }, [data, metric, limit])

  if (!chartData) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-700 mb-4">{title}</h3>
        <div className="h-64 flex items-center justify-center text-dark-400">
          Sem dados disponiveis
        </div>
      </div>
    )
  }

  const { items, maxValue, minValue, hasNegative } = chartData
  const innerWidth = width - MARGIN.left - MARGIN.right
  const innerHeight = height - MARGIN.top - MARGIN.bottom

  // For metrics with negative values (like saldo), center the axis
  const xDomain = hasNegative
    ? [Math.min(minValue * 1.1, 0), Math.max(maxValue * 1.1, 0)]
    : [0, maxValue * 1.1]

  const xScale = d3.scaleLinear()
    .domain(xDomain)
    .range([0, innerWidth])

  const yScale = d3.scaleBand()
    .domain(items.map(d => d.cadeia))
    .range([0, innerHeight])
    .padding(0.3)

  const zeroX = hasNegative ? xScale(0) : 0

  const formatValue = (v) => {
    if (metric === 'salario_medio') {
      return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
    }
    if (Math.abs(v) >= 1000) {
      return `${(v / 1000).toFixed(1)}K`
    }
    return v.toLocaleString('pt-BR')
  }

  const metricLabels = {
    admissoes: 'Admissoes',
    demissoes: 'Demissoes',
    saldo: 'Saldo',
    salario_medio: 'Salario Medio'
  }

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-dark-700 mb-2">{title}</h3>
      <p className="text-sm text-dark-500 mb-4">Metrica: {metricLabels[metric] || metric}</p>

      <svg width={width} height={height}>
        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          {/* Zero line for saldo */}
          {hasNegative && (
            <line
              x1={zeroX}
              x2={zeroX}
              y1={0}
              y2={innerHeight}
              stroke="#94a3b8"
              strokeWidth={1}
            />
          )}

          {/* Grid lines */}
          {xScale.ticks(5).map((tick, i) => (
            <line
              key={i}
              x1={xScale(tick)}
              x2={xScale(tick)}
              y1={0}
              y2={innerHeight}
              stroke="#e2e8f0"
              strokeDasharray="4,4"
            />
          ))}

          {/* X axis labels */}
          {xScale.ticks(5).map((tick, i) => (
            <text
              key={i}
              x={xScale(tick)}
              y={innerHeight + 15}
              textAnchor="middle"
              fill="#64748b"
              fontSize={10}
            >
              {formatValue(tick)}
            </text>
          ))}

          {/* Lollipops */}
          {items.map((item, i) => {
            const value = item[metric] || 0
            const y = yScale(item.cadeia) + yScale.bandwidth() / 2
            const xEnd = xScale(value)
            const color = item.cor || (value >= 0 ? '#22c55e' : '#ef4444')

            return (
              <g
                key={item.cadeia}
                className="cursor-pointer group"
                onClick={() => onCadeiaClick?.(item.cadeia)}
              >
                {/* Hover background */}
                <rect
                  x={-MARGIN.left}
                  y={yScale(item.cadeia) - 2}
                  width={innerWidth + MARGIN.left + MARGIN.right}
                  height={yScale.bandwidth() + 4}
                  fill="#f1f5f9"
                  fillOpacity={0}
                  className="group-hover:fill-opacity-100 transition-all"
                />

                {/* Line */}
                <line
                  x1={zeroX}
                  x2={xEnd}
                  y1={y}
                  y2={y}
                  stroke={color}
                  strokeWidth={2}
                />

                {/* Circle */}
                <circle
                  cx={xEnd}
                  cy={y}
                  r={7}
                  fill={color}
                  stroke="white"
                  strokeWidth={2}
                >
                  <title>{`${item.cadeia}: ${formatValue(value)}`}</title>
                </circle>

                {/* Value label on hover */}
                <text
                  x={value >= 0 ? xEnd + 12 : xEnd - 12}
                  y={y}
                  textAnchor={value >= 0 ? 'start' : 'end'}
                  alignmentBaseline="middle"
                  fill="#334155"
                  fontSize={11}
                  fontFamily="monospace"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {formatValue(value)}
                </text>

                {/* Y axis label */}
                <text
                  x={-8}
                  y={y}
                  textAnchor="end"
                  alignmentBaseline="middle"
                  fill="#334155"
                  fontSize={11}
                >
                  {item.cadeia.length > 18 ? item.cadeia.slice(0, 15) + '...' : item.cadeia}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
