// ATLAS-A11Y-HEX-SWEPT
// scope: Set de códigos dentro do recorte regional (null = estado inteiro);
// selectedMun: município filtrado (contorno); onMunClick: alterna o filtro mun.
function MapaSVG({ geoData, munDataMap, mapMetric, getColor, hoveredMun, setHoveredMun, scope, selectedMun, onMunClick }) {
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

  // Converter anéis de um polígono para path SVG
  const ringsToPath = (rings) => {
    return rings.map(ring => {
      return ring.map((coord, i) => {
        const [x, y] = toSVG(coord[0], coord[1])
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      }).join(' ') + ' Z'
    }).join(' ')
  }

  // Polygon: coordinates = [anéis]; MultiPolygon: coordinates = [[anéis], ...]
  const geometryToPath = (geometry) => {
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.map(ringsToPath).join(' ')
    }
    return ringsToPath(geometry.coordinates)
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mapa coroplético dos municípios do Paraná" style={{ width: '100%', height: '100%', background: '#f9fafb' }}>
      {geoData.features.map((feat, idx) => {
        const codIbge = String(feat.properties.CodIbge).slice(0, 6)
        const munData = munDataMap[codIbge]
        const value = munData ? munData[mapMetric] : 0
        const isHovered = hoveredMun?.codigo === codIbge

        const fora = scope !== null && !scope.has(codIbge)
        const isSel = selectedMun === codIbge

        const pathD = geometryToPath(feat.geometry)
        const setHover = () => setHoveredMun(munData ? { ...munData, nome: feat.properties.Municipio, meso: feat.properties.MesoIdr, regIdr: feat.properties.RegIdr } : { nome: feat.properties.Municipio, codigo: codIbge, [mapMetric]: 0, meso: feat.properties.MesoIdr, regIdr: feat.properties.RegIdr })

        return (
          <path
            key={idx}
            d={pathD}
            fill={isHovered ? '#e0b850' : fora ? '#e5e7eb' : getColor(value)}
            stroke={isSel ? '#14110c' : fora ? '#d1d5db' : '#fff'}
            strokeWidth={isSel ? 2.5 : 0.5}
            opacity={fora ? 0.5 : 1}
            style={{ cursor: 'pointer', transition: 'fill 0.15s, opacity 0.15s' }}
            tabIndex={0}
            aria-label={`${feat.properties.Municipio}: ${value ?? 0}`}
            aria-pressed={isSel}
            onClick={() => onMunClick(codIbge)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMunClick(codIbge) } }}
            onMouseEnter={setHover}
            onMouseLeave={() => setHoveredMun(null)}
            onFocus={setHover}
            onBlur={() => setHoveredMun(null)}
          />
        )
      })}
    </svg>
  )
}

export default MapaSVG
