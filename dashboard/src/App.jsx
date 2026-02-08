import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Treemap, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from 'recharts'
// Mapa usando coordenadas diretas
import {
  Users, TrendingUp, TrendingDown, DollarSign, Briefcase,
  BarChart3, Calendar, TreePine, Fish, Wheat, Building2, Info,
  MapPin, GraduationCap, UserCheck, Factory, Layers, Activity
} from 'lucide-react'
import './index.css'

const GEO_URL = './assets/mun_PR.json'

// Formatadores
const formatNumber = (n) => n?.toLocaleString('pt-BR') || '0'
const formatCurrency = (n) => `R$ ${n?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` || 'R$ 0,00'
const formatPercent = (n) => `${n?.toFixed(1)}%` || '0%'

function App() {
  const [data, setData] = useState(null)
  const [geoData, setGeoData] = useState(null)
  const [granularData, setGranularData] = useState(null)
  const [granularDimensions, setGranularDimensions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedCadeia, setSelectedCadeia] = useState(null)

  // Filtros globais (regionais)
  const [mesoFilter, setMesoFilter] = useState('')
  const [regIdrFilter, setRegIdrFilter] = useState('')
  const [munFilter, setMunFilter] = useState('')

  // Filtros interativos (por clique nos gráficos)
  const [cadeiaFilter, setCadeiaFilter] = useState('')
  const [sexoFilter, setSexoFilter] = useState('')
  const [faixaFilter, setFaixaFilter] = useState('')
  const [escolaridadeFilter, setEscolaridadeFilter] = useState('')
  const [periodoFilter, setPeriodoFilter] = useState('')

  useEffect(() => {
    // Carregar dados agregados e GeoJSON primeiro (essenciais)
    Promise.all([
      fetch('./data/aggregated_full.json').then(res => {
        if (!res.ok) throw new Error('Dados não encontrados')
        return res.json()
      }),
      fetch(GEO_URL).then(res => res.json()).catch(() => null),
    ])
      .then(([aggData, geo]) => {
        setData(aggData)
        setGeoData(geo)
        setLoading(false)

        // Carregar dados granulares em background (opcionais, para filtros avançados)
        fetch('./data/granular_cube.json')
          .then(res => res.ok ? res.json() : null)
          .then(cube => {
            if (cube) {
              setGranularData(cube)
            }
          })
          .catch(() => {})

        fetch('./data/granular_dimensions.json')
          .then(res => res.ok ? res.json() : null)
          .then(dims => {
            if (dims) {
              setGranularDimensions(dims)
            }
          })
          .catch(() => {})
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Extrair regiões únicas do GeoJSON (hook deve vir ANTES de returns condicionais)
  const { mesoRegioes, regIdrList, municipiosList } = useMemo(() => {
    if (!geoData) return { mesoRegioes: [], regIdrList: [], municipiosList: [] }
    const meso = new Set()
    const regIdr = new Set()
    const municipios = []
    geoData.features.forEach(f => {
      if (f.properties.MesoIdr) meso.add(f.properties.MesoIdr)
      if (f.properties.RegIdr) regIdr.add(f.properties.RegIdr)
      municipios.push({
        codigo: String(f.properties.CodIbge).slice(0, 6),
        nome: f.properties.Municipio,
        meso: f.properties.MesoIdr,
        regIdr: f.properties.RegIdr
      })
    })
    return {
      mesoRegioes: [...meso].sort(),
      regIdrList: [...regIdr].sort(),
      municipiosList: municipios.sort((a, b) => a.nome.localeCompare(b.nome))
    }
  }, [geoData])

  // Municípios filtrados por região (para o dropdown)
  const filteredMunicipiosList = useMemo(() => {
    if (!mesoFilter && !regIdrFilter) return municipiosList
    return municipiosList.filter(m => {
      const matchesMeso = !mesoFilter || m.meso === mesoFilter
      const matchesRegIdr = !regIdrFilter || m.regIdr === regIdrFilter
      return matchesMeso && matchesRegIdr
    })
  }, [municipiosList, mesoFilter, regIdrFilter])

  // Mapeamento de código de município para região
  const munRegionMap = useMemo(() => {
    if (!geoData) return {}
    const map = {}
    geoData.features.forEach(f => {
      const cod = String(f.properties.CodIbge).slice(0, 6)
      map[cod] = {
        meso: f.properties.MesoIdr,
        regIdr: f.properties.RegIdr
      }
    })
    return map
  }, [geoData])

  // Dados filtrados por município - agora também considera cadeiaFilter
  const filteredByMunicipio = useMemo(() => {
    if (!data) return []

    const hasAnyFilter = mesoFilter || regIdrFilter || munFilter || cadeiaFilter

    // Se não há filtros, retornar dados originais
    if (!hasAnyFilter) return data.byMunicipio

    // Se há filtro de cadeia, precisamos recalcular do granularData
    if (cadeiaFilter && granularData) {
      const munMap = {}
      granularData.forEach(r => {
        // Filtro de cadeia
        if (r.cadeia !== cadeiaFilter) return
        // Filtros regionais
        if (munFilter && r.mun !== munFilter) return
        if (mesoFilter || regIdrFilter) {
          const region = munRegionMap[r.mun]
          if (region) {
            if (mesoFilter && region.meso !== mesoFilter) return
            if (regIdrFilter && region.regIdr !== regIdrFilter) return
          }
        }

        if (!munMap[r.mun]) {
          munMap[r.mun] = { codigo: r.mun, admissoes: 0, demissoes: 0, salario_total: 0, count: 0 }
        }
        munMap[r.mun].admissoes += r.admissoes
        munMap[r.mun].demissoes += r.demissoes
        munMap[r.mun].salario_total += r.salario_medio * (r.admissoes + r.demissoes)
        munMap[r.mun].count += r.admissoes + r.demissoes
      })

      // Buscar nomes dos municípios do data original
      const munNames = {}
      data.byMunicipio.forEach(m => { munNames[m.codigo] = m.nome })

      return Object.values(munMap)
        .map(m => ({
          ...m,
          nome: munNames[m.codigo] || m.codigo,
          saldo: m.admissoes - m.demissoes,
          salario_medio: m.count > 0 ? m.salario_total / m.count : 0,
          cadeia_dominante: cadeiaFilter,
        }))
        .sort((a, b) => b.admissoes - a.admissoes)
    }

    // Apenas filtros regionais (sem cadeia)
    return data.byMunicipio.filter(m => {
      if (munFilter) return m.codigo === munFilter
      const region = munRegionMap[m.codigo]
      if (!region) return true
      const matchesMeso = !mesoFilter || region.meso === mesoFilter
      const matchesRegIdr = !regIdrFilter || region.regIdr === regIdrFilter
      return matchesMeso && matchesRegIdr
    })
  }, [data, granularData, mesoFilter, regIdrFilter, munFilter, munRegionMap, cadeiaFilter])

  const filteredTopMunicipios = useMemo(() => {
    if (!data) return []

    // Se tem cadeia filter, usar filteredByMunicipio (já filtrado)
    if (cadeiaFilter) {
      return filteredByMunicipio.slice(0, 20)
    }

    const topMunicipios = data.topMunicipios
    if (!mesoFilter && !regIdrFilter && !munFilter) return topMunicipios
    return topMunicipios.filter(m => {
      if (munFilter) return m.codigo === munFilter
      const region = munRegionMap[m.codigo]
      if (!region) return true
      const matchesMeso = !mesoFilter || region.meso === mesoFilter
      const matchesRegIdr = !regIdrFilter || region.regIdr === regIdrFilter
      return matchesMeso && matchesRegIdr
    })
  }, [data, filteredByMunicipio, mesoFilter, regIdrFilter, munFilter, munRegionMap, cadeiaFilter])

  // KPIs recalculados com base nos filtros ativos
  const filteredKpis = useMemo(() => {
    if (!data) return null
    const kpis = data.kpis

    const hasAnyFilter = mesoFilter || regIdrFilter || munFilter || cadeiaFilter
    if (!hasAnyFilter) return kpis

    // Se apenas cadeiaFilter está ativo e não temos granularData, usar byCadeia
    if (cadeiaFilter && !granularData && !mesoFilter && !regIdrFilter && !munFilter) {
      const cadeiaData = data.byCadeia.find(c => c.cadeia === cadeiaFilter)
      if (cadeiaData) {
        return {
          ...kpis,
          acumulado: {
            admissoes: cadeiaData.admissoes,
            demissoes: cadeiaData.demissoes,
            saldo: cadeiaData.saldo
          },
          salario: {
            ...kpis.salario,
            media: cadeiaData.salario_medio,
            mediana: cadeiaData.salario_mediana
          }
        }
      }
    }

    // Usar filteredByMunicipio para calcular KPIs
    const admissoes = filteredByMunicipio.reduce((a, m) => a + (m.admissoes || 0), 0)
    const demissoes = filteredByMunicipio.reduce((a, m) => a + (m.demissoes || 0), 0)
    const saldo = admissoes - demissoes
    const salarios = filteredByMunicipio.filter(m => m.salario_medio).map(m => m.salario_medio)
    const salarioMedia = salarios.length > 0 ? salarios.reduce((a, b) => a + b, 0) / salarios.length : 0
    const salarioMediana = salarios.length > 0 ? salarios.sort((a, b) => a - b)[Math.floor(salarios.length / 2)] : 0
    return {
      ...kpis,
      acumulado: { admissoes, demissoes, saldo },
      salario: { ...kpis.salario, media: salarioMedia, mediana: salarioMediana }
    }
  }, [data, granularData, filteredByMunicipio, mesoFilter, regIdrFilter, munFilter, cadeiaFilter])

  // Verificar se há filtros ativos
  const hasRegionalFilter = mesoFilter || regIdrFilter || munFilter
  const hasInteractiveFilter = cadeiaFilter || sexoFilter || faixaFilter || escolaridadeFilter || periodoFilter
  const hasFilter = hasRegionalFilter || hasInteractiveFilter
  const selectedMunName = munFilter ? municipiosList.find(m => m.codigo === munFilter)?.nome : null

  // Limpar filtros interativos
  const clearInteractiveFilters = () => {
    setCadeiaFilter('')
    setSexoFilter('')
    setFaixaFilter('')
    setEscolaridadeFilter('')
    setPeriodoFilter('')
  }

  // Dados filtrados do cubo granular
  const filteredCube = useMemo(() => {
    if (!granularData) return []
    let filtered = granularData

    // Aplicar filtros regionais
    if (hasRegionalFilter) {
      filtered = filtered.filter(r => {
        if (munFilter) return r.mun === munFilter
        const region = munRegionMap[r.mun]
        if (!region) return true
        const matchesMeso = !mesoFilter || region.meso === mesoFilter
        const matchesRegIdr = !regIdrFilter || region.regIdr === regIdrFilter
        return matchesMeso && matchesRegIdr
      })
    }

    // Aplicar filtros interativos
    if (cadeiaFilter) filtered = filtered.filter(r => r.cadeia === cadeiaFilter)
    if (periodoFilter) filtered = filtered.filter(r => r.periodo === periodoFilter)

    return filtered
  }, [granularData, mesoFilter, regIdrFilter, munFilter, cadeiaFilter, periodoFilter, munRegionMap, hasRegionalFilter])

  // Agregações calculadas a partir do cubo filtrado
  const filteredAggregations = useMemo(() => {
    if (!data) return null

    // Se não há filtros, usar dados pré-agregados
    if (!hasFilter) {
      return {
        timeseries: data.timeseries,
        byCadeia: data.byCadeia,
        bySexo: data.bySexo,
        byFaixaEtaria: data.byFaixaEtaria,
        byEscolaridade: data.byEscolaridade,
        byPorte: data.byPorte,
        seasonality: data.seasonality,
        yearly: data.yearly,
        timeseriesCadeia: data.timeseriesCadeia,
        crossCadeiaSexo: data.crossCadeiaSexo,
        salaryDistribution: data.salaryDistribution,
        byCnae: data.byCnae,
      }
    }

    // FALLBACK: Se granularData não está disponível, filtrar com dados existentes
    if (!granularData) {
      // Filtrar apenas por cadeia usando dados pré-agregados
      const filteredByCadeia = cadeiaFilter
        ? data.byCadeia.filter(c => c.cadeia === cadeiaFilter)
        : data.byCadeia

      const filteredByCnae = cadeiaFilter
        ? data.byCnae.filter(c => c.cadeia === cadeiaFilter)
        : data.byCnae

      const filteredSalaryDist = cadeiaFilter
        ? data.salaryDistribution.filter(s => s.cadeia === cadeiaFilter)
        : data.salaryDistribution

      const filteredTimeseriesCadeia = cadeiaFilter
        ? data.timeseriesCadeia.filter(t => t.cadeia === cadeiaFilter)
        : data.timeseriesCadeia

      const filteredCrossCadeiaSexo = cadeiaFilter
        ? data.crossCadeiaSexo.filter(c => c.cadeia === cadeiaFilter)
        : data.crossCadeiaSexo

      // Calcular timeseries da cadeia selecionada
      let timeseries = data.timeseries
      if (cadeiaFilter && filteredTimeseriesCadeia.length > 0) {
        const tsMap = {}
        filteredTimeseriesCadeia.forEach(t => {
          if (!tsMap[t.periodo]) {
            tsMap[t.periodo] = { periodo: t.periodo, admissoes: 0, demissoes: 0, saldo: 0 }
          }
          tsMap[t.periodo].admissoes += t.admissoes
          tsMap[t.periodo].demissoes += t.demissoes
          tsMap[t.periodo].saldo += t.saldo
        })
        timeseries = Object.values(tsMap).sort((a, b) => a.periodo.localeCompare(b.periodo))
        let saldoAcum = 0
        timeseries.forEach(t => {
          saldoAcum += t.saldo
          t.saldo_acumulado = saldoAcum
        })
      }

      return {
        timeseries,
        byCadeia: filteredByCadeia,
        bySexo: data.bySexo,
        byFaixaEtaria: data.byFaixaEtaria,
        byEscolaridade: data.byEscolaridade,
        byPorte: data.byPorte,
        seasonality: data.seasonality,
        yearly: data.yearly,
        timeseriesCadeia: filteredTimeseriesCadeia,
        crossCadeiaSexo: filteredCrossCadeiaSexo,
        salaryDistribution: filteredSalaryDist,
        byCnae: filteredByCnae,
      }
    }

    // Agregar timeseries do cubo filtrado
    const timeseriesMap = {}
    filteredCube.forEach(r => {
      if (!timeseriesMap[r.periodo]) {
        timeseriesMap[r.periodo] = { periodo: r.periodo, admissoes: 0, demissoes: 0, salario_total: 0, count: 0 }
      }
      timeseriesMap[r.periodo].admissoes += r.admissoes
      timeseriesMap[r.periodo].demissoes += r.demissoes
      timeseriesMap[r.periodo].salario_total += r.salario_medio * (r.admissoes + r.demissoes)
      timeseriesMap[r.periodo].count += r.admissoes + r.demissoes
    })
    const timeseries = Object.values(timeseriesMap)
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
      .map(t => ({
        ...t,
        saldo: t.admissoes - t.demissoes,
        salario_medio: t.count > 0 ? t.salario_total / t.count : 0,
      }))
    // Calcular saldo_acumulado
    let saldoAcum = 0
    timeseries.forEach(t => {
      saldoAcum += t.saldo
      t.saldo_acumulado = saldoAcum
    })

    // Agregar por cadeia
    const cadeiaMap = {}
    filteredCube.forEach(r => {
      if (!cadeiaMap[r.cadeia]) {
        cadeiaMap[r.cadeia] = { cadeia: r.cadeia, admissoes: 0, demissoes: 0, salario_total: 0, count: 0 }
      }
      cadeiaMap[r.cadeia].admissoes += r.admissoes
      cadeiaMap[r.cadeia].demissoes += r.demissoes
      cadeiaMap[r.cadeia].salario_total += r.salario_medio * (r.admissoes + r.demissoes)
      cadeiaMap[r.cadeia].count += r.admissoes + r.demissoes
    })
    const totalAdmissoes = Object.values(cadeiaMap).reduce((a, c) => a + c.admissoes, 0)
    const byCadeia = Object.values(cadeiaMap)
      .map(c => ({
        ...c,
        saldo: c.admissoes - c.demissoes,
        salario_medio: c.count > 0 ? c.salario_total / c.count : 0,
        salario_mediana: c.count > 0 ? c.salario_total / c.count : 0, // aproximação
        pct_admissoes: totalAdmissoes > 0 ? (c.admissoes / totalAdmissoes * 100).toFixed(1) : 0,
        cor: data.byCadeia.find(x => x.cadeia === c.cadeia)?.cor || '#808080',
      }))
      .sort((a, b) => b.admissoes - a.admissoes)

    // Agregar por período (para filtro de período no gráfico)
    const yearlyMap = {}
    filteredCube.forEach(r => {
      const ano = r.periodo.slice(0, 4)
      if (!yearlyMap[ano]) {
        yearlyMap[ano] = { ano: parseInt(ano), admissoes: 0, demissoes: 0, salario_total: 0, count: 0 }
      }
      yearlyMap[ano].admissoes += r.admissoes
      yearlyMap[ano].demissoes += r.demissoes
      yearlyMap[ano].salario_total += r.salario_medio * (r.admissoes + r.demissoes)
      yearlyMap[ano].count += r.admissoes + r.demissoes
    })
    const yearly = Object.values(yearlyMap)
      .map(y => ({
        ...y,
        saldo: y.admissoes - y.demissoes,
        salario_medio: y.count > 0 ? y.salario_total / y.count : 0,
      }))
      .sort((a, b) => a.ano - b.ano)

    // Sazonalidade
    const mesMeses = { 1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun', 7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez' }
    const seasonMap = {}
    filteredCube.forEach(r => {
      const mes = parseInt(r.periodo.slice(5, 7))
      if (!seasonMap[mes]) {
        seasonMap[mes] = { mes, admissoes: 0, demissoes: 0 }
      }
      seasonMap[mes].admissoes += r.admissoes
      seasonMap[mes].demissoes += r.demissoes
    })
    const seasonality = Object.values(seasonMap)
      .map(s => ({
        ...s,
        mes_nome: mesMeses[s.mes],
        saldo: s.admissoes - s.demissoes,
      }))
      .sort((a, b) => a.mes - b.mes)
    const avgAdm = seasonality.reduce((a, s) => a + s.admissoes, 0) / 12
    seasonality.forEach(s => {
      s.indice = avgAdm > 0 ? (s.admissoes / avgAdm * 100).toFixed(1) : 100
    })

    // Agregar dimensões demográficas de granularDimensions
    let bySexo = data.bySexo
    let byFaixaEtaria = data.byFaixaEtaria
    let byEscolaridade = data.byEscolaridade
    let byPorte = data.byPorte

    // Aplicar filtros às dimensões demográficas quando há filtro regional OU filtro de cadeia
    const needsDimensionFiltering = hasRegionalFilter || cadeiaFilter
    if (granularDimensions && needsDimensionFiltering) {
      // Filtrar por região E cadeia
      const filterRecords = (records) => {
        return records.filter(r => {
          // Filtro de cadeia
          if (cadeiaFilter && r.cadeia !== cadeiaFilter) return false
          // Filtros regionais
          if (!hasRegionalFilter) return true
          if (munFilter) return r.mun === munFilter
          const region = munRegionMap[r.mun]
          if (!region) return true
          const matchesMeso = !mesoFilter || region.meso === mesoFilter
          const matchesRegIdr = !regIdrFilter || region.regIdr === regIdrFilter
          return matchesMeso && matchesRegIdr
        })
      }

      // Agregar por sexo
      if (granularDimensions.bySexo) {
        const filteredSexo = filterRecords(granularDimensions.bySexo)
        const sexoMap = {}
        filteredSexo.forEach(r => {
          if (!sexoMap[r.sexo]) sexoMap[r.sexo] = { sexo: r.sexo, admissoes: 0, demissoes: 0 }
          sexoMap[r.sexo].admissoes += r.admissoes
          sexoMap[r.sexo].demissoes += r.demissoes
        })
        const totalAdm = Object.values(sexoMap).reduce((a, s) => a + s.admissoes, 0)
        bySexo = Object.values(sexoMap).map(s => ({
          ...s,
          saldo: s.admissoes - s.demissoes,
          pct: totalAdm > 0 ? (s.admissoes / totalAdm * 100).toFixed(1) : 0,
        }))
      }

      // Agregar por faixa etária
      if (granularDimensions.byFaixa) {
        const filteredFaixa = filterRecords(granularDimensions.byFaixa)
        const faixaMap = {}
        filteredFaixa.forEach(r => {
          if (!faixaMap[r.faixa]) faixaMap[r.faixa] = { faixa: r.faixa, admissoes: 0, demissoes: 0 }
          faixaMap[r.faixa].admissoes += r.admissoes
          faixaMap[r.faixa].demissoes += r.demissoes
        })
        const totalAdm = Object.values(faixaMap).reduce((a, f) => a + f.admissoes, 0)
        byFaixaEtaria = Object.values(faixaMap).map(f => ({
          ...f,
          saldo: f.admissoes - f.demissoes,
          pct: totalAdm > 0 ? (f.admissoes / totalAdm * 100).toFixed(1) : 0,
        }))
      }

      // Agregar por escolaridade
      if (granularDimensions.byEscolaridade) {
        const filteredEsc = filterRecords(granularDimensions.byEscolaridade)
        const escMap = {}
        filteredEsc.forEach(r => {
          if (!escMap[r.escolaridade]) escMap[r.escolaridade] = { escolaridade: r.escolaridade, admissoes: 0, demissoes: 0, salario_total: 0, count: 0 }
          escMap[r.escolaridade].admissoes += r.admissoes
          escMap[r.escolaridade].demissoes += r.demissoes
          escMap[r.escolaridade].salario_total += r.salario_medio * (r.admissoes + r.demissoes)
          escMap[r.escolaridade].count += r.admissoes + r.demissoes
        })
        const totalAdm = Object.values(escMap).reduce((a, e) => a + e.admissoes, 0)
        byEscolaridade = Object.values(escMap)
          .map(e => ({
            ...e,
            saldo: e.admissoes - e.demissoes,
            salario_mediana: e.count > 0 ? e.salario_total / e.count : 0,
            pct: totalAdm > 0 ? (e.admissoes / totalAdm * 100).toFixed(1) : 0,
          }))
          .sort((a, b) => b.admissoes - a.admissoes)
      }

      // Agregar por porte
      if (granularDimensions.byPorte) {
        const filteredPorte = filterRecords(granularDimensions.byPorte)
        const porteMap = {}
        filteredPorte.forEach(r => {
          if (!porteMap[r.porte]) porteMap[r.porte] = { porte: r.porte, admissoes: 0, demissoes: 0 }
          porteMap[r.porte].admissoes += r.admissoes
          porteMap[r.porte].demissoes += r.demissoes
        })
        const totalAdm = Object.values(porteMap).reduce((a, p) => a + p.admissoes, 0)
        byPorte = Object.values(porteMap).map(p => ({
          ...p,
          saldo: p.admissoes - p.demissoes,
          pct: totalAdm > 0 ? (p.admissoes / totalAdm * 100).toFixed(1) : 0,
        }))
      }
    }

    // Calcular timeseriesCadeia a partir do cubo filtrado
    const timeseriesCadeiaMap = {}
    filteredCube.forEach(r => {
      const key = `${r.periodo}_${r.cadeia}`
      if (!timeseriesCadeiaMap[key]) {
        timeseriesCadeiaMap[key] = { periodo: r.periodo, cadeia: r.cadeia, admissoes: 0, demissoes: 0 }
      }
      timeseriesCadeiaMap[key].admissoes += r.admissoes
      timeseriesCadeiaMap[key].demissoes += r.demissoes
    })
    const timeseriesCadeia = Object.values(timeseriesCadeiaMap)
      .map(t => ({ ...t, saldo: t.admissoes - t.demissoes }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo))

    // Calcular crossCadeiaSexo a partir de granularDimensions
    let crossCadeiaSexo = data.crossCadeiaSexo
    if (granularDimensions?.bySexo && (hasRegionalFilter || cadeiaFilter)) {
      const crossMap = {}
      const filteredSexoData = granularDimensions.bySexo.filter(r => {
        if (cadeiaFilter && r.cadeia !== cadeiaFilter) return false
        if (!hasRegionalFilter) return true
        if (munFilter) return r.mun === munFilter
        const region = munRegionMap[r.mun]
        if (!region) return true
        return (!mesoFilter || region.meso === mesoFilter) && (!regIdrFilter || region.regIdr === regIdrFilter)
      })
      filteredSexoData.forEach(r => {
        const key = `${r.cadeia}_${r.sexo}`
        if (!crossMap[key]) {
          crossMap[key] = { cadeia: r.cadeia, sexo: r.sexo, admissoes: 0, demissoes: 0 }
        }
        crossMap[key].admissoes += r.admissoes
        crossMap[key].demissoes += r.demissoes
      })
      crossCadeiaSexo = Object.values(crossMap).map(c => ({
        ...c,
        saldo: c.admissoes - c.demissoes,
        salario_medio: 0, // Não temos salário nesse cubo
      }))
    }

    // Filtrar salaryDistribution por cadeia
    let salaryDistribution = data.salaryDistribution
    if (cadeiaFilter) {
      salaryDistribution = data.salaryDistribution.filter(s => s.cadeia === cadeiaFilter)
    }

    // Filtrar byCnae por cadeia (byCnae já tem o campo cadeia)
    let byCnae = data.byCnae
    if (cadeiaFilter) {
      byCnae = data.byCnae.filter(c => c.cadeia === cadeiaFilter)
    }

    return {
      timeseries,
      byCadeia,
      bySexo,
      byFaixaEtaria,
      byEscolaridade,
      byPorte,
      seasonality,
      yearly,
      timeseriesCadeia,
      crossCadeiaSexo,
      salaryDistribution,
      byCnae,
    }
  }, [data, granularData, granularDimensions, hasFilter, hasRegionalFilter, filteredCube, mesoFilter, regIdrFilter, munFilter, munRegionMap, cadeiaFilter])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-neutral-600">Carregando dados...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-100">
        <div className="bg-red-50 rounded-xl p-8 text-center max-w-md">
          <Info className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-red-800 mb-2">Erro ao carregar dados</h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  const {
    metadata, kpis, timeseries, byCadeia, timeseriesCadeia, byCnae,
    byMunicipio, bySexo, byFaixaEtaria, byEscolaridade, byPorte,
    seasonality, yearly, crossCadeiaSexo, crossCadeiaIdade,
    salaryDistribution, topMunicipios
  } = data

  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
    { id: 'cadeia', label: 'Cadeias Produtivas', icon: Layers },
    { id: 'cnae', label: 'Atividades CNAE', icon: Factory },
    { id: 'perfil', label: 'Perfil do Trabalhador', icon: Users },
    { id: 'salario', label: 'Salários', icon: DollarSign },
    { id: 'geo', label: 'Municípios', icon: MapPin },
    { id: 'tempo', label: 'Evolução Temporal', icon: Activity },
  ]

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-800 via-green-700 to-green-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 backdrop-blur-sm rounded-xl">
                <Briefcase className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">{metadata.titulo}</h1>
                <p className="text-green-100 text-sm">{metadata.subtitulo}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="bg-white/10 rounded-lg px-3 py-2">
                <span className="text-green-200">Período:</span>{' '}
                <span className="font-semibold">{metadata.periodo_inicial} a {metadata.periodo_final}</span>
              </div>
              <div className="bg-white/10 rounded-lg px-3 py-2">
                <span className="text-green-200">Registros:</span>{' '}
                <span className="font-semibold">{formatNumber(metadata.total_registros)}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Filtros Globais */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-3 mb-3">
        <div className="bg-white rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-neutral-600">Filtrar por:</span>
          <select
            value={mesoFilter}
            onChange={(e) => { setMesoFilter(e.target.value); setRegIdrFilter(''); setMunFilter('') }}
            className="px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Todas Mesorregiões</option>
            {mesoRegioes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={regIdrFilter}
            onChange={(e) => { setRegIdrFilter(e.target.value); setMunFilter('') }}
            className="px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Todas Regionais IDR</option>
            {regIdrList.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={munFilter}
            onChange={(e) => setMunFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 max-w-[200px]"
          >
            <option value="">Todos Municípios ({filteredMunicipiosList.length})</option>
            {filteredMunicipiosList.map(m => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}
          </select>
          {hasFilter && (
            <>
              <button
                onClick={() => { setMesoFilter(''); setRegIdrFilter(''); setMunFilter('') }}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
              >
                Limpar filtros
              </button>
              <span className="text-sm text-neutral-500">
                {munFilter ? selectedMunName : `${filteredByMunicipio.length} de ${byMunicipio.length} municípios`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            title="Admissões"
            value={formatNumber(filteredKpis.acumulado.admissoes)}
            subtitle={hasFilter ? `${filteredByMunicipio.length} municípios` : `${formatNumber(kpis.ultimo_mes.admissoes)} em ${kpis.periodo_referencia}`}
            icon={TrendingUp}
            color="green"
          />
          <KpiCard
            title="Demissões"
            value={formatNumber(filteredKpis.acumulado.demissoes)}
            subtitle={hasFilter ? `${filteredByMunicipio.length} municípios` : `${formatNumber(kpis.ultimo_mes.demissoes)} em ${kpis.periodo_referencia}`}
            icon={TrendingDown}
            color="red"
          />
          <KpiCard
            title="Saldo"
            value={filteredKpis.acumulado.saldo >= 0 ? `+${formatNumber(filteredKpis.acumulado.saldo)}` : formatNumber(filteredKpis.acumulado.saldo)}
            subtitle={hasFilter ? `Região selecionada` : `${kpis.ultimo_mes.saldo >= 0 ? '+' : ''}${formatNumber(kpis.ultimo_mes.saldo)} último mês`}
            icon={Users}
            color={filteredKpis.acumulado.saldo >= 0 ? 'green' : 'red'}
          />
          <KpiCard
            title="Salário Mediano"
            value={formatCurrency(filteredKpis.salario.mediana)}
            subtitle={`Média: ${formatCurrency(filteredKpis.salario.media)}`}
            icon={DollarSign}
            color="amber"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex overflow-x-auto gap-2 pb-2">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-neutral-600 hover:bg-green-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Indicador de filtros interativos */}
        <ActiveFilters
          filters={{
            cadeia: cadeiaFilter,
            sexo: sexoFilter,
            faixa: faixaFilter,
            escolaridade: escolaridadeFilter,
            periodo: periodoFilter,
          }}
          onClear={(key) => {
            if (key === 'cadeia') setCadeiaFilter('')
            if (key === 'sexo') setSexoFilter('')
            if (key === 'faixa') setFaixaFilter('')
            if (key === 'escolaridade') setEscolaridadeFilter('')
            if (key === 'periodo') setPeriodoFilter('')
          }}
          onClearAll={clearInteractiveFilters}
        />

        {activeTab === 'overview' && (
          <OverviewTab
            timeseries={filteredAggregations?.timeseries || []}
            byCadeia={filteredAggregations?.byCadeia || []}
            bySexo={filteredAggregations?.bySexo || []}
            byFaixaEtaria={filteredAggregations?.byFaixaEtaria || []}
            seasonality={filteredAggregations?.seasonality || []}
            hasFilter={hasRegionalFilter}
            filterLabel={selectedMunName || mesoFilter || regIdrFilter}
            onCadeiaClick={(cadeia) => setCadeiaFilter(prev => prev === cadeia ? '' : cadeia)}
            onSexoClick={(sexo) => setSexoFilter(prev => prev === sexo ? '' : sexo)}
            onFaixaClick={(faixa) => setFaixaFilter(prev => prev === faixa ? '' : faixa)}
            cadeiaFilter={cadeiaFilter}
            sexoFilter={sexoFilter}
            faixaFilter={faixaFilter}
          />
        )}
        {activeTab === 'cadeia' && (
          <CadeiaTab
            byCadeia={filteredAggregations?.byCadeia || []}
            timeseriesCadeia={filteredAggregations?.timeseriesCadeia || []}
            crossCadeiaSexo={filteredAggregations?.crossCadeiaSexo || []}
            selectedCadeia={selectedCadeia}
            setSelectedCadeia={setSelectedCadeia}
            hasFilter={hasRegionalFilter}
            filterLabel={selectedMunName || mesoFilter || regIdrFilter}
            onCadeiaClick={(cadeia) => setCadeiaFilter(prev => prev === cadeia ? '' : cadeia)}
            cadeiaFilter={cadeiaFilter}
          />
        )}
        {activeTab === 'cnae' && (
          <CnaeTab
            byCnae={filteredAggregations?.byCnae || []}
            byCadeia={filteredAggregations?.byCadeia || []}
            hasFilter={hasRegionalFilter}
            filterLabel={selectedMunName || mesoFilter || regIdrFilter}
            onCadeiaClick={(cadeia) => setCadeiaFilter(prev => prev === cadeia ? '' : cadeia)}
            cadeiaFilter={cadeiaFilter}
          />
        )}
        {activeTab === 'perfil' && (
          <PerfilTab
            bySexo={filteredAggregations?.bySexo || []}
            byFaixaEtaria={filteredAggregations?.byFaixaEtaria || []}
            byEscolaridade={filteredAggregations?.byEscolaridade || []}
            byPorte={filteredAggregations?.byPorte || []}
            kpis={filteredKpis}
            hasFilter={hasRegionalFilter}
            filterLabel={selectedMunName || mesoFilter || regIdrFilter}
            onSexoClick={(sexo) => setSexoFilter(prev => prev === sexo ? '' : sexo)}
            onFaixaClick={(faixa) => setFaixaFilter(prev => prev === faixa ? '' : faixa)}
            onEscolaridadeClick={(esc) => setEscolaridadeFilter(prev => prev === esc ? '' : esc)}
            sexoFilter={sexoFilter}
            faixaFilter={faixaFilter}
            escolaridadeFilter={escolaridadeFilter}
          />
        )}
        {activeTab === 'salario' && (
          <SalarioTab
            salaryDistribution={filteredAggregations?.salaryDistribution || []}
            byCadeia={filteredAggregations?.byCadeia || []}
            byEscolaridade={filteredAggregations?.byEscolaridade || []}
            hasFilter={hasRegionalFilter}
            filterLabel={selectedMunName || mesoFilter || regIdrFilter}
            onCadeiaClick={(cadeia) => setCadeiaFilter(prev => prev === cadeia ? '' : cadeia)}
            cadeiaFilter={cadeiaFilter}
            onEscolaridadeClick={(esc) => setEscolaridadeFilter(prev => prev === esc ? '' : esc)}
            escolaridadeFilter={escolaridadeFilter}
          />
        )}
        {activeTab === 'geo' && (
          <GeoTab
            topMunicipios={filteredTopMunicipios}
            byMunicipio={filteredByMunicipio}
            metadata={metadata}
            geoData={geoData}
            mesoFilter={mesoFilter}
            regIdrFilter={regIdrFilter}
            munFilter={munFilter}
            cadeiaFilter={cadeiaFilter}
            hasFilter={hasFilter}
            filterLabel={cadeiaFilter || selectedMunName || mesoFilter || regIdrFilter}
          />
        )}
        {activeTab === 'tempo' && (
          <TempoTab
            timeseries={filteredAggregations?.timeseries || []}
            yearly={filteredAggregations?.yearly || []}
            seasonality={filteredAggregations?.seasonality || []}
            hasFilter={hasRegionalFilter}
            filterLabel={selectedMunName || mesoFilter || regIdrFilter}
            onPeriodoClick={(periodo) => setPeriodoFilter(prev => prev === periodo ? '' : periodo)}
            periodoFilter={periodoFilter}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-neutral-800 text-neutral-300 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Fonte de Dados */}
            <div className="space-y-3">
              <h4 className="text-white font-semibold text-sm flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-400" />
                Fonte de Dados
              </h4>
              <ul className="space-y-1.5 text-xs text-neutral-400">
                <li>RAIS - Relação Anual de Informações Sociais</li>
                <li>MTE - Ministério do Trabalho e Emprego</li>
              </ul>
              <div className="text-xs text-neutral-500 pt-2 border-t border-neutral-700">
                <p>{metadata.atualizacao}</p>
                <p>{metadata.total_cadeias} cadeias | {metadata.total_subclasses} atividades CNAE</p>
              </div>
            </div>

            {/* Datageo Paraná */}
            <div className="space-y-3">
              <h4 className="text-white font-semibold text-sm">
                <a
                  href="https://datageoparana.github.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-indigo-400 transition-colors inline-flex items-center gap-1"
                >
                  Datageo Paraná
                  <span className="text-xs">↗</span>
                </a>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                <a href="https://avnergomes.github.io/vbp-parana/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2.5 py-1 text-[10px] rounded-full border border-neutral-600 text-neutral-300 hover:text-indigo-300 hover:border-indigo-400 transition-colors">VBP Paraná</a>
                <a href="https://avnergomes.github.io/precos-diarios/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2.5 py-1 text-[10px] rounded-full border border-neutral-600 text-neutral-300 hover:text-indigo-300 hover:border-indigo-400 transition-colors">Preços Diários</a>
                <a href="https://avnergomes.github.io/precos-florestais/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2.5 py-1 text-[10px] rounded-full border border-neutral-600 text-neutral-300 hover:text-indigo-300 hover:border-indigo-400 transition-colors">Preços Florestais</a>
                <a href="https://avnergomes.github.io/precos-de-terras/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2.5 py-1 text-[10px] rounded-full border border-neutral-600 text-neutral-300 hover:text-indigo-300 hover:border-indigo-400 transition-colors">Preços de Terras</a>
                <a href="https://avnergomes.github.io/comexstat-parana/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2.5 py-1 text-[10px] rounded-full border border-neutral-600 text-neutral-300 hover:text-indigo-300 hover:border-indigo-400 transition-colors">ComexStat Paraná</a>
              </div>
            </div>

            {/* Developer */}
            <div className="space-y-3 flex flex-col items-start md:items-end">
              <a
                href="https://avnergomes.github.io/portfolio"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-neutral-400 hover:text-indigo-400 transition-colors"
                title="Portfolio"
              >
                <span className="text-xs">Desenvolvido por Avner Gomes</span>
              </a>
            </div>
          </div>

          {/* Bottom */}
          <div className="mt-6 pt-4 border-t border-neutral-700 flex items-center justify-between text-[10px] text-neutral-500">
            <p>Emprego Agro Paraná · Dados públicos RAIS/MTE</p>
            <span className="px-2 py-0.5 bg-indigo-900/50 text-indigo-300 rounded-full">
              {metadata.total_municipios} municípios
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ===== COMPONENTS =====

function KpiCard({ title, value, subtitle, icon: Icon, color }) {
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

function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-6 ${className}`}>
      {title && <h3 className="text-lg font-semibold text-neutral-800 mb-4">{title}</h3>}
      {children}
    </div>
  )
}

function FilterIndicator({ hasFilter, filterLabel, message = "Todos os gráficos estão filtrados." }) {
  if (!hasFilter) return null
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-4 text-sm text-green-700">
      <span className="font-medium">Filtro regional: {filterLabel}</span>
      <span className="text-green-600 ml-2">- {message}</span>
    </div>
  )
}

function ActiveFilters({ filters, onClear, onClearAll }) {
  const labels = {
    cadeia: 'Cadeia',
    sexo: 'Sexo',
    faixa: 'Faixa Etária',
    escolaridade: 'Escolaridade',
    periodo: 'Período'
  }
  const active = Object.entries(filters).filter(([_, v]) => v)
  if (!active.length) return null

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
      <span className="text-sm text-blue-700 font-medium">Filtros por clique:</span>
      {active.map(([key, value]) => (
        <span
          key={key}
          className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-1"
        >
          {labels[key]}: {value}
          <button
            onClick={() => onClear(key)}
            className="ml-1 hover:text-red-600 font-bold"
            title="Remover filtro"
          >
            ×
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="px-3 py-1 text-red-600 text-sm hover:underline ml-2"
      >
        Limpar todos
      </button>
    </div>
  )
}

// ===== TABS =====

function OverviewTab({ timeseries, byCadeia, bySexo, byFaixaEtaria, seasonality, hasFilter, filterLabel, onCadeiaClick, onSexoClick, onFaixaClick, cadeiaFilter, sexoFilter, faixaFilter }) {
  // Evitar renderizar gráficos com dados vazios
  const hasData = timeseries?.length > 0

  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {/* Série Temporal */}
      <Card title="Evolução Mensal do Emprego Agrícola">
        <div className="h-80" style={{ minHeight: '320px' }}>
          {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={timeseries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11 }} interval={5} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatNumber(v)} />
              <Legend />
              <Bar yAxisId="left" dataKey="admissoes" name="Admissões" fill="#22c55e" opacity={0.8} />
              <Bar yAxisId="left" dataKey="demissoes" name="Demissões" fill="#ef4444" opacity={0.8} />
              <Line yAxisId="right" type="monotone" dataKey="saldo_acumulado" name="Saldo Acumulado" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400">Sem dados para exibir</div>
          )}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Cadeias - Clicável */}
        <Card title="Principais Cadeias Produtivas (clique para filtrar)">
          <div className="h-72" style={{ minHeight: '288px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCadeia.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="cadeia" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar
                  dataKey="admissoes"
                  name="Admissões"
                  cursor="pointer"
                  onClick={(data) => onCadeiaClick && onCadeiaClick(data.cadeia)}
                >
                  {byCadeia.slice(0, 8).map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.cadeia === cadeiaFilter ? '#15803d' : '#22c55e'}
                      stroke={entry.cadeia === cadeiaFilter ? '#166534' : 'none'}
                      strokeWidth={entry.cadeia === cadeiaFilter ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Distribuição por Sexo - Clicável */}
        <Card title="Distribuição por Sexo (clique para filtrar)">
          <div className="h-72 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={bySexo.filter(s => s.sexo !== 'Não informado')}
                  dataKey="admissoes"
                  nameKey="sexo"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ sexo, pct }) => `${sexo}: ${pct}%`}
                  cursor="pointer"
                  onClick={(data) => onSexoClick && onSexoClick(data.sexo)}
                >
                  {bySexo.filter(s => s.sexo !== 'Não informado').map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.sexo === sexoFilter
                        ? (entry.sexo === 'Masculino' ? '#1d4ed8' : '#be185d')
                        : (entry.sexo === 'Masculino' ? '#3b82f6' : '#ec4899')
                      }
                      stroke={entry.sexo === sexoFilter ? '#000' : 'none'}
                      strokeWidth={entry.sexo === sexoFilter ? 2 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatNumber(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Faixa Etária - Clicável */}
        <Card title="Distribuição por Faixa Etária (clique para filtrar)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byFaixaEtaria.filter(f => f.faixa !== 'Não informado')}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="faixa" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar
                  dataKey="admissoes"
                  name="Admissões"
                  cursor="pointer"
                  onClick={(data) => onFaixaClick && onFaixaClick(data.faixa)}
                >
                  {byFaixaEtaria.filter(f => f.faixa !== 'Não informado').map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.faixa === faixaFilter ? '#6d28d9' : '#8b5cf6'}
                      stroke={entry.faixa === faixaFilter ? '#5b21b6' : 'none'}
                      strokeWidth={entry.faixa === faixaFilter ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Sazonalidade */}
        <Card title="Padrão Sazonal (Média Mensal)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={seasonality}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes_nome" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Area type="monotone" dataKey="admissoes" name="Admissões" fill="#22c55e" fillOpacity={0.3} stroke="#16a34a" />
                <Area type="monotone" dataKey="demissoes" name="Demissões" fill="#ef4444" fillOpacity={0.3} stroke="#dc2626" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}

function CadeiaTab({ byCadeia, timeseriesCadeia, crossCadeiaSexo, selectedCadeia, setSelectedCadeia, hasFilter, filterLabel, onCadeiaClick, cadeiaFilter }) {
  const top10 = byCadeia.slice(0, 10)
  const [sortCol, setSortCol] = useState('admissoes')
  const [sortDir, setSortDir] = useState('desc')

  const sortedCadeias = useMemo(() => {
    const data = [...byCadeia]
    data.sort((a, b) => {
      let aVal = a[sortCol], bVal = b[sortCol]
      if (sortCol === 'cadeia') return sortDir === 'asc' ? (aVal || '').localeCompare(bVal || '') : (bVal || '').localeCompare(aVal || '')
      return sortDir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0)
    })
    return data
  }, [byCadeia, sortCol, sortDir])

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortTh = ({ col, label, align = 'left' }) => (
    <th className={`py-3 px-2 cursor-pointer hover:bg-neutral-100 select-none ${align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => toggleSort(col)}>
      {label} {sortCol === col && <span className="text-green-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )

  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {/* Treemap - Clicável */}
      <Card title="Distribuição por Cadeia Produtiva (clique para filtrar)">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={top10.map(c => ({
                name: c.cadeia,
                size: c.admissoes,
                fill: c.cadeia === cadeiaFilter ? '#15803d' : c.cor,
                isSelected: c.cadeia === cadeiaFilter
              }))}
              dataKey="size"
              aspectRatio={4/3}
              stroke="#fff"
              onClick={(node) => onCadeiaClick && onCadeiaClick(node.name)}
              content={({ x, y, width, height, name, fill, isSelected }) => (
                <g style={{ cursor: 'pointer' }}>
                  <rect
                    x={x} y={y} width={width} height={height}
                    fill={fill}
                    stroke={isSelected ? '#000' : '#fff'}
                    strokeWidth={isSelected ? 3 : 2}
                  />
                  {width > 60 && height > 30 && (
                    <text x={x + width/2} y={y + height/2} textAnchor="middle" fill="#fff" fontSize={12} fontWeight="bold">
                      {name}
                    </text>
                  )}
                </g>
              )}
            />
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tabela detalhada */}
      <Card title="Detalhamento por Cadeia Produtiva (clique para ordenar)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <SortTh col="cadeia" label="Cadeia" />
                <SortTh col="admissoes" label="Admissões" align="right" />
                <SortTh col="demissoes" label="Demissões" align="right" />
                <SortTh col="saldo" label="Saldo" align="right" />
                <SortTh col="salario_mediana" label="Salário Mediano" align="right" />
                <SortTh col="pct_admissoes" label="%" align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedCadeias.map(c => (
                <tr
                  key={c.cadeia}
                  className={`border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer ${c.cadeia === cadeiaFilter ? 'bg-green-50' : ''}`}
                  onClick={() => onCadeiaClick && onCadeiaClick(c.cadeia)}
                >
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.cor }} />
                      {c.cadeia}
                      {c.cadeia === cadeiaFilter && <span className="text-xs text-green-600 ml-1">(filtrado)</span>}
                    </div>
                  </td>
                  <td className="text-right py-2 px-2 text-green-600">{formatNumber(c.admissoes)}</td>
                  <td className="text-right py-2 px-2 text-red-600">{formatNumber(c.demissoes)}</td>
                  <td className={`text-right py-2 px-2 font-medium ${c.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {c.saldo >= 0 ? '+' : ''}{formatNumber(c.saldo)}
                  </td>
                  <td className="text-right py-2 px-2">{formatCurrency(c.salario_mediana)}</td>
                  <td className="text-right py-2 px-2 text-neutral-500">{c.pct_admissoes}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Gênero por cadeia */}
      <Card title="Distribuição de Gênero por Cadeia">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={
              top10.map(c => {
                const masc = crossCadeiaSexo.find(x => x.cadeia === c.cadeia && x.sexo === 'Masculino')
                const fem = crossCadeiaSexo.find(x => x.cadeia === c.cadeia && x.sexo === 'Feminino')
                const total = (masc?.admissoes || 0) + (fem?.admissoes || 0)
                return {
                  cadeia: c.cadeia,
                  masculino: total > 0 ? ((masc?.admissoes || 0) / total * 100).toFixed(1) : 0,
                  feminino: total > 0 ? ((fem?.admissoes || 0) / total * 100).toFixed(1) : 0,
                }
              })
            } layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis dataKey="cadeia" type="category" width={120} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Bar dataKey="masculino" name="Masculino" stackId="a" fill="#3b82f6" />
              <Bar dataKey="feminino" name="Feminino" stackId="a" fill="#ec4899" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}

function CnaeTab({ byCnae, byCadeia, hasFilter, filterLabel, onCadeiaClick, cadeiaFilter: globalCadeiaFilter }) {
  const [filter, setFilter] = useState('')
  const [localCadeiaFilter, setLocalCadeiaFilter] = useState('')
  // Use global filter if set, otherwise use local
  const effectiveCadeiaFilter = globalCadeiaFilter || localCadeiaFilter
  const [sortCol, setSortCol] = useState('admissoes')
  const [sortDir, setSortDir] = useState('desc')

  const filtered = useMemo(() => {
    let data = byCnae.filter(c => {
      const matchText = filter === '' || c.cnae.includes(filter) || c.cadeia.toLowerCase().includes(filter.toLowerCase())
      const matchCadeia = effectiveCadeiaFilter === '' || c.cadeia === effectiveCadeiaFilter
      return matchText && matchCadeia
    })
    data.sort((a, b) => {
      let aVal = a[sortCol], bVal = b[sortCol]
      if (sortCol === 'cnae' || sortCol === 'cadeia') return sortDir === 'asc' ? (aVal || '').localeCompare(bVal || '') : (bVal || '').localeCompare(aVal || '')
      return sortDir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0)
    })
    return data
  }, [byCnae, filter, effectiveCadeiaFilter, sortCol, sortDir])

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortTh = ({ col, label, align = 'left' }) => (
    <th className={`py-3 px-2 cursor-pointer hover:bg-neutral-100 select-none ${align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => toggleSort(col)}>
      {label} {sortCol === col && <span className="text-green-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )

  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      <Card>
        <div className="flex flex-wrap gap-4 mb-4">
          <input
            type="text"
            placeholder="Buscar por código CNAE..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <select
            value={effectiveCadeiaFilter}
            onChange={(e) => {
              setLocalCadeiaFilter(e.target.value)
              // Se há um filtro global, usar o global
              if (onCadeiaClick) onCadeiaClick(e.target.value || '')
            }}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Todas as cadeias</option>
            {byCadeia.map(c => (
              <option key={c.cadeia} value={c.cadeia}>{c.cadeia}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50">
              <tr className="border-b border-neutral-200">
                <SortTh col="cnae" label="CNAE" />
                <SortTh col="descricao" label="Descrição" />
                <SortTh col="cadeia" label="Cadeia" />
                <SortTh col="admissoes" label="Admissões" align="right" />
                <SortTh col="demissoes" label="Demissões" align="right" />
                <SortTh col="saldo" label="Saldo" align="right" />
                <SortTh col="salario_mediana" label="Sal. Med." align="right" />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(c => (
                <tr key={c.cnae} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2 px-2 font-mono text-xs">{c.cnae}</td>
                  <td className="py-2 px-2 text-xs max-w-[250px] truncate" title={c.descricao}>{c.descricao}</td>
                  <td className="py-2 px-2 text-xs">{c.cadeia}</td>
                  <td className="text-right py-2 px-2 text-green-600">{formatNumber(c.admissoes)}</td>
                  <td className="text-right py-2 px-2 text-red-600">{formatNumber(c.demissoes)}</td>
                  <td className={`text-right py-2 px-2 font-medium ${c.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {c.saldo >= 0 ? '+' : ''}{formatNumber(c.saldo)}
                  </td>
                  <td className="text-right py-2 px-2">{formatCurrency(c.salario_mediana)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <p className="text-sm text-neutral-500 mt-4 text-center">
              Mostrando 100 de {filtered.length} atividades
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

function PerfilTab({ bySexo, byFaixaEtaria, byEscolaridade, byPorte, kpis, hasFilter, filterLabel, onSexoClick, onFaixaClick, onEscolaridadeClick, sexoFilter, faixaFilter, escolaridadeFilter }) {
  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">% Masculino</div>
          <div className="text-2xl font-bold text-blue-600">{kpis.perfil.pct_masculino}%</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">% Feminino</div>
          <div className="text-2xl font-bold text-pink-600">{(100 - kpis.perfil.pct_masculino).toFixed(1)}%</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Idade Média</div>
          <div className="text-2xl font-bold text-purple-600">{kpis.perfil.idade_media} anos</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Salário Mediano</div>
          <div className="text-2xl font-bold text-amber-600">{formatCurrency(kpis.salario.mediana)}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Sexo - Clicável */}
        <Card title="Por Sexo (clique para filtrar)">
          <div className="space-y-4">
            {bySexo.filter(s => s.sexo !== 'Não informado').map(s => (
              <div
                key={s.sexo}
                className={`flex items-center gap-4 cursor-pointer p-2 rounded-lg transition-colors ${s.sexo === sexoFilter ? 'bg-blue-50 ring-2 ring-blue-300' : 'hover:bg-neutral-50'}`}
                onClick={() => onSexoClick && onSexoClick(s.sexo)}
              >
                <div className="w-24 text-sm font-medium">{s.sexo}</div>
                <div className="flex-1 bg-neutral-100 rounded-full h-6 overflow-hidden">
                  <div
                    className={`h-full ${s.sexo === 'Masculino' ? 'bg-blue-500' : 'bg-pink-500'}`}
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
                <div className="w-20 text-right text-sm">
                  <span className="font-bold">{s.pct}%</span>
                  <span className="text-neutral-400 ml-1">({formatNumber(s.admissoes)})</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Faixa Etária - Clicável */}
        <Card title="Por Faixa Etária (clique para filtrar)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byFaixaEtaria.filter(f => f.faixa !== 'Não informado')} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="faixa" type="category" width={100} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar
                  dataKey="admissoes"
                  cursor="pointer"
                  onClick={(data) => onFaixaClick && onFaixaClick(data.faixa)}
                >
                  {byFaixaEtaria.filter(f => f.faixa !== 'Não informado').map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.faixa === faixaFilter ? '#6d28d9' : '#8b5cf6'}
                      stroke={entry.faixa === faixaFilter ? '#5b21b6' : 'none'}
                      strokeWidth={entry.faixa === faixaFilter ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Escolaridade - Clicável */}
        <Card title="Por Escolaridade (clique para filtrar)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byEscolaridade.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="escolaridade" type="category" width={130} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar
                  dataKey="admissoes"
                  cursor="pointer"
                  onClick={(data) => onEscolaridadeClick && onEscolaridadeClick(data.escolaridade)}
                >
                  {byEscolaridade.slice(0, 8).map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.escolaridade === escolaridadeFilter ? '#0891b2' : '#06b6d4'}
                      stroke={entry.escolaridade === escolaridadeFilter ? '#0e7490' : 'none'}
                      strokeWidth={entry.escolaridade === escolaridadeFilter ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Porte da empresa */}
        <Card title="Por Porte da Empresa">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPorte}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="porte" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar dataKey="admissoes" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}

function SalarioTab({ salaryDistribution, byCadeia, byEscolaridade, hasFilter, filterLabel, onCadeiaClick, cadeiaFilter, onEscolaridadeClick, escolaridadeFilter }) {
  const [sortCol, setSortCol] = useState('p50')
  const [sortDir, setSortDir] = useState('desc')

  const salarioData = salaryDistribution
    .filter(s => s.cadeia !== 'Cacau' && s.cadeia !== 'Fumo')
    .sort((a, b) => b.p50 - a.p50)
    .slice(0, 12)

  const sortedSalary = useMemo(() => {
    const data = [...salaryDistribution]
    data.sort((a, b) => {
      let aVal = a[sortCol], bVal = b[sortCol]
      if (sortCol === 'cadeia') return sortDir === 'asc' ? (aVal || '').localeCompare(bVal || '') : (bVal || '').localeCompare(aVal || '')
      return sortDir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0)
    })
    return data
  }, [salaryDistribution, sortCol, sortDir])

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortTh = ({ col, label, align = 'left' }) => (
    <th className={`py-3 px-2 cursor-pointer hover:bg-neutral-100 select-none ${align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => toggleSort(col)}>
      {label} {sortCol === col && <span className="text-green-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )

  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {/* Box plot style - Clicável */}
      <Card title="Distribuição Salarial por Cadeia (clique para filtrar)">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={salarioData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${v.toLocaleString()}`} />
              <YAxis dataKey="cadeia" type="category" width={140} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar
                dataKey="p50"
                name="Mediana"
                cursor="pointer"
                onClick={(data) => onCadeiaClick && onCadeiaClick(data.cadeia)}
              >
                {salarioData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.cadeia === cadeiaFilter ? '#15803d' : '#22c55e'}
                    stroke={entry.cadeia === cadeiaFilter ? '#166534' : 'none'}
                    strokeWidth={entry.cadeia === cadeiaFilter ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tabela de percentis */}
      <Card title="Percentis Salariais por Cadeia (clique para ordenar)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <SortTh col="cadeia" label="Cadeia" />
                <SortTh col="p10" label="P10" align="right" />
                <SortTh col="p25" label="P25" align="right" />
                <SortTh col="p50" label="Mediana" align="right" />
                <SortTh col="p75" label="P75" align="right" />
                <SortTh col="p90" label="P90" align="right" />
                <SortTh col="mean" label="Média" align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedSalary.map(s => (
                <tr key={s.cadeia} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2 px-2 font-medium">{s.cadeia}</td>
                  <td className="text-right py-2 px-2 text-neutral-500">{formatCurrency(s.p10)}</td>
                  <td className="text-right py-2 px-2 text-neutral-500">{formatCurrency(s.p25)}</td>
                  <td className="text-right py-2 px-2 font-bold text-green-600">{formatCurrency(s.p50)}</td>
                  <td className="text-right py-2 px-2 text-neutral-500">{formatCurrency(s.p75)}</td>
                  <td className="text-right py-2 px-2 text-neutral-500">{formatCurrency(s.p90)}</td>
                  <td className="text-right py-2 px-2">{formatCurrency(s.mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Salário por escolaridade - Clicável */}
      <Card title="Salário por Escolaridade (clique para filtrar)">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byEscolaridade.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="escolaridade" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${v.toLocaleString()}`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar
                dataKey="salario_mediana"
                name="Salário Mediano"
                cursor="pointer"
                onClick={(data) => onEscolaridadeClick && onEscolaridadeClick(data.escolaridade)}
              >
                {byEscolaridade.slice(0, 8).map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.escolaridade === escolaridadeFilter ? '#d97706' : '#f59e0b'}
                    stroke={entry.escolaridade === escolaridadeFilter ? '#b45309' : 'none'}
                    strokeWidth={entry.escolaridade === escolaridadeFilter ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}

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
            fill={isHovered ? '#fbbf24' : (hasFilter && !isFiltered ? '#e5e7eb' : getColor(value))}
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

function GeoTab({ topMunicipios, byMunicipio, metadata, geoData, mesoFilter, regIdrFilter, munFilter, cadeiaFilter, hasFilter, filterLabel }) {
  const [hoveredMun, setHoveredMun] = useState(null)
  const [mapMetric, setMapMetric] = useState('admissoes')
  const [sortColumn, setSortColumn] = useState('admissoes')
  const [sortDirection, setSortDirection] = useState('desc')

  // Mapear código do município para dados
  const munDataMap = useMemo(() => {
    const map = {}
    byMunicipio.forEach(m => {
      map[m.codigo] = m
    })
    return map
  }, [byMunicipio])

  // Calcular max para escala
  const { maxPositive, maxNegative } = useMemo(() => {
    const values = byMunicipio.map(m => m[mapMetric] || 0)
    return {
      maxPositive: Math.max(...values, 0),
      maxNegative: Math.min(...values, 0)
    }
  }, [byMunicipio, mapMetric])

  // Escala de cores por métrica
  const getColor = (value, metric) => {
    if (value === 0 || value === null || value === undefined) return '#f3f4f6'

    if (metric === 'admissoes') {
      // Verde
      const intensity = Math.pow(value / maxPositive, 0.4)
      const r = Math.round(220 - intensity * 186)
      const g = Math.round(252 - intensity * 55)
      const b = Math.round(231 - intensity * 140)
      return `rgb(${r}, ${g}, ${b})`
    } else if (metric === 'demissoes') {
      // Vermelho
      const intensity = Math.pow(value / maxPositive, 0.4)
      const r = Math.round(254 - intensity * 20)
      const g = Math.round(226 - intensity * 158)
      const b = Math.round(226 - intensity * 158)
      return `rgb(${r}, ${g}, ${b})`
    } else {
      // Saldo - verde para positivo, vermelho para negativo
      if (value > 0) {
        const intensity = Math.pow(value / maxPositive, 0.4)
        const r = Math.round(220 - intensity * 186)
        const g = Math.round(252 - intensity * 55)
        const b = Math.round(231 - intensity * 140)
        return `rgb(${r}, ${g}, ${b})`
      } else {
        const intensity = Math.pow(Math.abs(value) / Math.abs(maxNegative), 0.4)
        const r = Math.round(254 - intensity * 20)
        const g = Math.round(226 - intensity * 158)
        const b = Math.round(226 - intensity * 158)
        return `rgb(${r}, ${g}, ${b})`
      }
    }
  }

  // Ordenar municípios
  const sortedMunicipios = useMemo(() => {
    const data = [...byMunicipio]
    data.sort((a, b) => {
      let aVal = a[sortColumn]
      let bVal = b[sortColumn]
      // Para strings, comparar como texto
      if (sortColumn === 'nome' || sortColumn === 'cadeia_dominante') {
        aVal = aVal || ''
        bVal = bVal || ''
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      // Para números
      aVal = aVal || 0
      bVal = bVal || 0
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
    })
    return data
  }, [byMunicipio, sortColumn, sortDirection])

  // Toggle ordenação
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  // Componente de cabeçalho ordenável
  const SortHeader = ({ column, label, align = 'left' }) => (
    <th
      className={`py-3 px-2 cursor-pointer hover:bg-neutral-100 select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => handleSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortColumn === column && (
          <span className="text-green-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  )

  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Municípios Exibidos</div>
          <div className="text-2xl font-bold text-green-600">{byMunicipio.length}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Maior Empregador</div>
          <div className="text-lg font-bold text-neutral-800">{topMunicipios[0]?.nome}</div>
          <div className="text-sm text-neutral-500">{formatNumber(topMunicipios[0]?.admissoes)} admissões</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Top 20 representa</div>
          <div className="text-2xl font-bold text-blue-600">
            {byMunicipio.length > 0 ? (topMunicipios.reduce((a, m) => a + m.admissoes, 0) / byMunicipio.reduce((a, m) => a + m.admissoes, 0) * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>

      {/* Mapa Coroplético */}
      <Card title="Mapa de Emprego Agrícola por Município">
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <button
            onClick={() => setMapMetric('admissoes')}
            className={`px-3 py-1 rounded-lg text-sm ${mapMetric === 'admissoes' ? 'bg-green-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            Admissões
          </button>
          <button
            onClick={() => setMapMetric('demissoes')}
            className={`px-3 py-1 rounded-lg text-sm ${mapMetric === 'demissoes' ? 'bg-red-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            Demissões
          </button>
          <button
            onClick={() => setMapMetric('saldo')}
            className={`px-3 py-1 rounded-lg text-sm ${mapMetric === 'saldo' ? 'bg-blue-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            Saldo
          </button>
          {(mesoFilter || regIdrFilter) && (
            <span className="text-sm text-green-600 ml-2">
              Filtro ativo: {mesoFilter || regIdrFilter}
            </span>
          )}
        </div>

        {hoveredMun && (
          <div className="bg-neutral-800 text-white px-3 py-2 rounded-lg mb-2 text-sm inline-block">
            <strong>{hoveredMun.nome}</strong> - {mapMetric === 'admissoes' ? 'Admissões' : mapMetric === 'demissoes' ? 'Demissões' : 'Saldo'}: {formatNumber(hoveredMun[mapMetric])}
          </div>
        )}

        <div className="h-[500px] bg-neutral-50 rounded-lg overflow-hidden">
          {geoData ? (
            <MapaSVG
              geoData={geoData}
              munDataMap={munDataMap}
              mapMetric={mapMetric}
              getColor={(val) => getColor(val, mapMetric)}
              hoveredMun={hoveredMun}
              setHoveredMun={setHoveredMun}
              mesoFilter={mesoFilter}
              regIdrFilter={regIdrFilter}
              munFilter={munFilter}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400">
              Carregando mapa...
            </div>
          )}
        </div>

        {/* Legenda */}
        <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
          {mapMetric === 'saldo' ? (
            <>
              <span className="text-xs text-red-600">- Demissões</span>
              <div className="flex">
                {[1, 0.6, 0.3, 0].map((v, i) => (
                  <div key={`neg${i}`} className="w-6 h-4" style={{ backgroundColor: getColor(-v * Math.abs(maxNegative), mapMetric) }} />
                ))}
                {[0, 0.3, 0.6, 1].map((v, i) => (
                  <div key={`pos${i}`} className="w-6 h-4" style={{ backgroundColor: getColor(v * maxPositive, mapMetric) }} />
                ))}
              </div>
              <span className="text-xs text-green-600">+ Admissões</span>
            </>
          ) : (
            <>
              <span className="text-xs text-neutral-500">Menor</span>
              <div className="flex">
                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v, i) => (
                  <div key={i} className="w-6 h-4" style={{ backgroundColor: getColor(v * maxPositive, mapMetric) }} />
                ))}
              </div>
              <span className="text-xs text-neutral-500">Maior</span>
            </>
          )}
        </div>
      </Card>

      {/* Top 20 municípios */}
      <Card title="Top 20 Municípios por Admissões">
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topMunicipios} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="nome" type="category" width={100} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatNumber(v)} />
              <Legend />
              <Bar dataKey="admissoes" name="Admissões" fill="#22c55e" />
              <Bar dataKey="demissoes" name="Demissões" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tabela */}
      <Card title="Todos os Municípios (clique no cabeçalho para ordenar)">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50">
              <tr className="border-b border-neutral-200">
                <th className="text-left py-3 px-2 w-10">#</th>
                <SortHeader column="nome" label="Município" />
                <SortHeader column="admissoes" label="Admissões" align="right" />
                <SortHeader column="demissoes" label="Demissões" align="right" />
                <SortHeader column="saldo" label="Saldo" align="right" />
                <SortHeader column="salario_medio" label="Salário Médio" align="right" />
                <SortHeader column="cadeia_dominante" label="Cadeia Dominante" />
              </tr>
            </thead>
            <tbody>
              {sortedMunicipios.map((m, i) => (
                <tr key={m.codigo} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2 px-2 text-neutral-400">{i + 1}</td>
                  <td className="py-2 px-2 font-medium">{m.nome}</td>
                  <td className="text-right py-2 px-2 text-green-600">{formatNumber(m.admissoes)}</td>
                  <td className="text-right py-2 px-2 text-red-600">{formatNumber(m.demissoes)}</td>
                  <td className={`text-right py-2 px-2 font-medium ${m.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {m.saldo >= 0 ? '+' : ''}{formatNumber(m.saldo)}
                  </td>
                  <td className="text-right py-2 px-2">{formatCurrency(m.salario_medio)}</td>
                  <td className="py-2 px-2 text-neutral-500">{m.cadeia_dominante}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-400 mt-2">Total: {sortedMunicipios.length} municípios</p>
      </Card>
    </div>
  )
}

function TempoTab({ timeseries, yearly, seasonality, hasFilter, filterLabel, onPeriodoClick, periodoFilter }) {
  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {periodoFilter && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          <span className="font-medium">Período selecionado: {periodoFilter}</span>
          <button
            onClick={() => onPeriodoClick && onPeriodoClick(periodoFilter)}
            className="ml-2 text-red-600 hover:underline"
          >
            Limpar
          </button>
        </div>
      )}
      {/* Série temporal completa */}
      <Card title="Série Histórica Completa (2020-2025)">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeseries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11 }} interval={5} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatNumber(v)} />
              <Legend />
              <Area type="monotone" dataKey="admissoes" name="Admissões" fill="#22c55e" fillOpacity={0.3} stroke="#16a34a" />
              <Area type="monotone" dataKey="demissoes" name="Demissões" fill="#ef4444" fillOpacity={0.3} stroke="#dc2626" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Saldo acumulado */}
      <Card title="Saldo Acumulado">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeseries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11 }} interval={5} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatNumber(v)} />
              <Line type="monotone" dataKey="saldo_acumulado" name="Saldo Acumulado" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Anual - Clicável */}
        <Card title="Resumo Anual (clique para filtrar por ano)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Legend />
                <Bar
                  dataKey="admissoes"
                  name="Admissões"
                  cursor="pointer"
                  onClick={(data) => {
                    // Filtrar por ano (todos os meses daquele ano)
                    const ano = String(data.ano)
                    const currentAno = periodoFilter ? periodoFilter.slice(0, 4) : ''
                    if (currentAno === ano) {
                      onPeriodoClick && onPeriodoClick('')
                    } else {
                      onPeriodoClick && onPeriodoClick(`${ano}-01`)
                    }
                  }}
                >
                  {yearly.map((entry, index) => {
                    const isSelected = periodoFilter && periodoFilter.startsWith(String(entry.ano))
                    return (
                      <Cell
                        key={`cell-adm-${index}`}
                        fill={isSelected ? '#15803d' : '#22c55e'}
                        stroke={isSelected ? '#166534' : 'none'}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                    )
                  })}
                </Bar>
                <Bar dataKey="demissoes" name="Demissões">
                  {yearly.map((entry, index) => {
                    const isSelected = periodoFilter && periodoFilter.startsWith(String(entry.ano))
                    return (
                      <Cell
                        key={`cell-dem-${index}`}
                        fill={isSelected ? '#b91c1c' : '#ef4444'}
                        stroke={isSelected ? '#991b1b' : 'none'}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Sazonalidade */}
        <Card title="Padrão Sazonal">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={seasonality}>
                <PolarGrid />
                <PolarAngleAxis dataKey="mes_nome" tick={{ fontSize: 11 }} />
                <Radar name="Índice Sazonal" dataKey="indice" stroke="#16a34a" fill="#22c55e" fillOpacity={0.5} />
                <Tooltip formatter={(v) => `${v}%`} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-neutral-500 mt-2 text-center">
            Índice 100 = média mensal. Valores acima indicam meses com mais contratações.
          </p>
        </Card>
      </div>
    </div>
  )
}

export default App
