// ATLAS-A11Y-HEX-SWEPT
function MapaSVG({ geoData, munDataMap, mapMetric, getColor, hoveredMun, setHoveredMun, mesoFilter, regIdrFilter, munFilter }) {
  const width = 800
  const height = 520
  const padding = 10

  // Bounds do Paraná
  const bounds = {
    minLon: -54.6190,
    maxLon: -48.0238,
    minLat: -26.7163,
    maxLat: -22.5167
  }

  // Escala para caber no SVG
  const scaleX = (width - 2 * padding) / (bounds.maxLon - bounds.minLon)
  const scaleY = (height - 2 * padding) / (bounds.maxLat - bounds.minLat)
  const scale = Math.min(scaleX, scaleY)

  // Função para converter coordenadas geográficas para SVG
  const toSVG = (lon, lat) => {
    const x = padding + (lon - bounds.minLon) * scale
    const y = padding + (bounds.maxLat - lat) * scale  // Y invertido
    return [x, y]
  }

  // Converter polygon para path SVG
  const polygonToPath = (coordinates) => {
    return coordinates.map(ring => {
      return ring.map((coord, i) => {
        const [x, y] = toSVG(coord[0], coord[1])
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      }).join(' ') + ' Z'
    }).join(' ')
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', background: '#f9fafb' }}>
      {geoData.features.map((feat, idx) => {
        const codIbge = String(feat.properties.CodIbge).slice(0, 6)
        const munData = munDataMap[codIbge]
        const value = munData ? munData[mapMetric] : 0
        const isHovered = hoveredMun?.codigo === codIbge

        // Verificar se passa no filtro
        const matchesMun = !munFilter || codIbge === munFilter
        const matchesMeso = !mesoFilter || feat.properties.MesoIdr === mesoFilter
        const matchesRegIdr = !regIdrFilter || feat.properties.RegIdr === regIdrFilter
        const isFiltered = munFilter ? matchesMun : (matchesMeso && matchesRegIdr)
        const hasFilter = mesoFilter || regIdrFilter || munFilter

        const pathD = polygonToPath(feat.geometry.coordinates)

        return (
          <path
            key={idx}
            d={pathD}
            fill={isHovered ? '#e0b850' : (hasFilter && !isFiltered ? '#e5e7eb' : getColor(value))}
            stroke={hasFilter && !isFiltered ? '#d1d5db' : '#fff'}
            strokeWidth={0.5}
            opacity={hasFilter && !isFiltered ? 0.5 : 1}
            style={{ cursor: 'pointer', transition: 'fill 0.15s, opacity 0.15s' }}
            onMouseEnter={() => setHoveredMun(munData ? { ...munData, nome: feat.properties.Municipio, meso: feat.properties.MesoIdr, regIdr: feat.properties.RegIdr } : { nome: feat.properties.Municipio, codigo: codIbge, [mapMetric]: 0, meso: feat.properties.MesoIdr, regIdr: feat.properties.RegIdr })}
            onMouseLeave={() => setHoveredMun(null)}
          />
        )
      })}
    </svg>
  )
}

export default MapaSVG
