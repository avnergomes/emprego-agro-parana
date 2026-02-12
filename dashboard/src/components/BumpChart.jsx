import { useMemo, useState } from 'react'
import * as d3 from 'd3'

const MARGIN = { top: 30, right: 120, bottom: 40, left: 50 }

export default function BumpChart({
  data,
  title = "Evolucao do Ranking de Cadeias",
  width = 800,
  height = 450,
  metric = 'saldo', // 'admissoes', 'demissoes', 'saldo'
  topN = 10
}) {
  const [hoveredCadeia, setHoveredCadeia] = useState(null)

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null

    // Group by period and calculate rankings
    const byPeriod = {}
    data.forEach(item => {
      const period = item.periodo
      if (!byPeriod[period]) byPeriod[period] = []
      byPeriod[period].push({
        cadeia: item.cadeia,
        value: item[metric] || 0,
        cor: item.cor
      })
    })

    // Sort periods
    const periods = Object.keys(byPeriod).sort()
    if (periods.length < 2) return null

    // Get top N cadeias by total value
    const totalByCadeia = {}
    data.forEach(item => {
      if (!totalByCadeia[item.cadeia]) {
        totalByCadeia[item.cadeia] = { total: 0, cor: item.cor }
      }
      totalByCadeia[item.cadeia].total += Math.abs(item[metric] || 0)
    })

    const topCadeias = Object.entries(totalByCadeia)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, topN)
      .map(([cadeia, info]) => ({ cadeia, cor: info.cor }))

    const topCadeiaNames = new Set(topCadeias.map(c => c.cadeia))

    // Calculate rankings for each period
    const rankings = periods.map(period => {
      const sorted = byPeriod[period]
        .filter(d => topCadeiaNames.has(d.cadeia))
        .sort((a, b) => b.value - a.value)

      const result = { period }
      sorted.forEach((item, idx) => {
        result[item.cadeia] = idx + 1
      })
      return result
    })

    return { rankings, periods, topCadeias }
  }, [data, metric, topN])

  if (!chartData) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-700 mb-4">{title}</h3>
        <div className="h-64 flex items-center justify-center text-dark-400">
          Dados insuficientes para o grafico
        </div>
      </div>
    )
  }

  const { rankings, periods, topCadeias } = chartData
  const innerWidth = width - MARGIN.left - MARGIN.right
  const innerHeight = height - MARGIN.top - MARGIN.bottom

  // Scales
  const xScale = d3.scalePoint()
    .domain(periods)
    .range([0, innerWidth])
    .padding(0.1)

  const yScale = d3.scaleLinear()
    .domain([1, topN])
    .range([0, innerHeight])

  // Line generator
  const lineGenerator = d3.line()
    .x(d => xScale(d.period))
    .y(d => yScale(d.rank))
    .curve(d3.curveMonotoneX)

  // Format period for display
  const formatPeriod = (p) => {
    const [year, month] = p.split('-')
    return `${month}/${year.slice(2)}`
  }

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-dark-700 mb-4">{title}</h3>

      <svg width={width} height={height}>
        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          {/* X axis */}
          {periods.filter((_, i) => i % Math.ceil(periods.length / 12) === 0).map(period => (
            <g key={period} transform={`translate(${xScale(period)}, ${innerHeight})`}>
              <line y1={0} y2={5} stroke="#94a3b8" />
              <text y={20} textAnchor="middle" fill="#64748b" fontSize={10}>
                {formatPeriod(period)}
              </text>
            </g>
          ))}

          {/* Y axis (rankings) */}
          {d3.range(1, topN + 1).map(rank => (
            <g key={rank} transform={`translate(0, ${yScale(rank)})`}>
              <line x1={-5} x2={innerWidth} stroke="#e2e8f0" strokeDasharray="4,4" />
              <text x={-10} textAnchor="end" alignmentBaseline="middle" fill="#64748b" fontSize={11}>
                {rank}
              </text>
            </g>
          ))}

          {/* Lines for each cadeia */}
          {topCadeias.map(({ cadeia, cor }) => {
            const lineData = rankings
              .filter(r => r[cadeia])
              .map(r => ({ period: r.period, rank: r[cadeia] }))

            if (lineData.length < 2) return null

            const isHovered = hoveredCadeia === cadeia
            const opacity = hoveredCadeia ? (isHovered ? 1 : 0.15) : 0.7

            return (
              <g key={cadeia}>
                <path
                  d={lineGenerator(lineData)}
                  fill="none"
                  stroke={cor || '#64748b'}
                  strokeWidth={isHovered ? 3 : 2}
                  opacity={opacity}
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredCadeia(cadeia)}
                  onMouseLeave={() => setHoveredCadeia(null)}
                />
                {/* End point circle */}
                {lineData.length > 0 && (
                  <circle
                    cx={xScale(lineData[lineData.length - 1].period)}
                    cy={yScale(lineData[lineData.length - 1].rank)}
                    r={isHovered ? 6 : 4}
                    fill={cor || '#64748b'}
                    opacity={opacity}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredCadeia(cadeia)}
                    onMouseLeave={() => setHoveredCadeia(null)}
                  >
                    <title>{cadeia}: #{lineData[lineData.length - 1].rank}</title>
                  </circle>
                )}
              </g>
            )
          })}

          {/* Legend */}
          {topCadeias.slice(0, 8).map(({ cadeia, cor }, i) => {
            const lastRanking = rankings[rankings.length - 1]
            const rank = lastRanking?.[cadeia]

            return (
              <g
                key={cadeia}
                transform={`translate(${innerWidth + 10}, ${yScale(rank || i + 1)})`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredCadeia(cadeia)}
                onMouseLeave={() => setHoveredCadeia(null)}
              >
                <circle r={4} fill={cor || '#64748b'} />
                <text
                  x={10}
                  alignmentBaseline="middle"
                  fill={hoveredCadeia === cadeia ? '#1e293b' : '#64748b'}
                  fontSize={10}
                  fontWeight={hoveredCadeia === cadeia ? 600 : 400}
                >
                  {cadeia.length > 15 ? cadeia.slice(0, 12) + '...' : cadeia}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
