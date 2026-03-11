import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Users, TrendingUp, TrendingDown, DollarSign, Briefcase,
  BarChart3, Layers, Factory, MapPin, Info, Activity
} from 'lucide-react'

// Components
import KpiCard from './components/KpiCard'
import ActiveFilters from './components/ActiveFilters'
import OverviewTab from './components/OverviewTab'
import CadeiaTab from './components/CadeiaTab'
import CnaeTab from './components/CnaeTab'
import PerfilTab from './components/PerfilTab'
import SalarioTab from './components/SalarioTab'
import GeoTab from './components/GeoTab'
import TempoTab from './components/TempoTab'

import './index.css'

const GEO_URL = `${import.meta.env.BASE_URL}assets/mun_PR.json`

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
  const [isGranularLoading, setIsGranularLoading] = useState(false)
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
    // AbortController para cancelar fetches se componente desmontar
    const abortController = new AbortController()
    const { signal } = abortController

    // Carregar dados agregados e GeoJSON primeiro (essenciais)
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/aggregated_full.json`, { signal }).then(res => {
        if (!res.ok) throw new Error('Dados não encontrados')
        return res.json()
      }),
      fetch(GEO_URL, { signal }).then(res => res.json()).catch(() => null),
    ])
      .then(([aggData, geo]) => {
        if (signal.aborted) return
        setData(aggData)
        setGeoData(geo)
        setLoading(false)

        // Carregar dados granulares em background (opcionais, para filtros avançados)
        setIsGranularLoading(true)

        Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/granular_cube.json`, { signal })
            .then(res => res.ok ? res.json() : null)
            .catch(() => null),
          fetch(`${import.meta.env.BASE_URL}data/granular_dimensions.json`, { signal })
            .then(res => res.ok ? res.json() : null)
            .catch(() => null)
        ])
          .then(([cube, dims]) => {
            if (signal.aborted) return
            if (cube) setGranularData(cube)
            if (dims) setGranularDimensions(dims)
          })
          .catch(() => {})
          .finally(() => {
            if (!signal.aborted) setIsGranularLoading(false)
          })
      })
      .catch(err => {
        if (signal.aborted) return
        setError(err.message)
        setLoading(false)
      })

    // Cleanup: cancelar fetches pendentes ao desmontar
    return () => {
      abortController.abort()
    }
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
    // Média ponderada por headcount (corrige problema de mean-of-means)
    const municipiosComSalario = filteredByMunicipio.filter(m => m.salario_medio && m.count > 0)
    const totalSalario = municipiosComSalario.reduce((sum, m) => sum + (m.salario_medio * m.count), 0)
    const totalCount = municipiosComSalario.reduce((sum, m) => sum + m.count, 0)
    const salarioMedia = totalCount > 0 ? totalSalario / totalCount : 0
    return {
      ...kpis,
      acumulado: { admissoes, demissoes, saldo },
      salario: { ...kpis.salario, media: salarioMedia }
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

  // Tab scroll indicators
  const tabContainerRef = useRef(null)
  const [scrollClasses, setScrollClasses] = useState('')

  const updateScrollIndicators = useCallback(() => {
    const el = tabContainerRef.current
    if (!el) return
    const hasLeft = el.scrollLeft > 4
    const hasRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 4
    const classes = [
      hasLeft ? 'scroll-left' : '',
      hasRight ? 'scroll-right' : '',
    ].filter(Boolean).join(' ')
    setScrollClasses(classes)
  }, [])

  useEffect(() => {
    const el = tabContainerRef.current
    if (!el) return
    updateScrollIndicators()
    el.addEventListener('scroll', updateScrollIndicators, { passive: true })
    window.addEventListener('resize', updateScrollIndicators)
    return () => {
      el.removeEventListener('scroll', updateScrollIndicators)
      window.removeEventListener('resize', updateScrollIndicators)
    }
  }, [updateScrollIndicators, loading])

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
            salario_medio: e.count > 0 ? e.salario_total / e.count : 0,
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
            title="Salário Médio"
            value={formatCurrency(filteredKpis.salario.media)}
            subtitle="Ponderado por vínculos"
            icon={DollarSign}
            color="amber"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className={`tab-scroll-container ${scrollClasses}`}>
          <div
            ref={tabContainerRef}
            className="flex overflow-x-auto gap-2 pb-2"
            role="tablist"
            aria-label="Seções do dashboard"
          >
            {tabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`tabpanel-${tab.id}`}
                  id={`tab-${tab.id}`}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-green-600 text-white shadow-md'
                      : 'bg-white text-neutral-600 hover:bg-green-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
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
                <a href="https://avnergomes.github.io/censo-parana/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2.5 py-1 text-[10px] rounded-full border border-neutral-600 text-neutral-300 hover:text-indigo-300 hover:border-indigo-400 transition-colors">Censo Paraná</a>
                <a href="https://avnergomes.github.io/credito-rural-parana/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2.5 py-1 text-[10px] rounded-full border border-neutral-600 text-neutral-300 hover:text-indigo-300 hover:border-indigo-400 transition-colors">Crédito Rural</a>
                <a href="https://avnergomes.github.io/saude-parana/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2.5 py-1 text-[10px] rounded-full border border-neutral-600 text-neutral-300 hover:text-indigo-300 hover:border-indigo-400 transition-colors">Saúde Paraná</a>
              </div>
            </div>

            {/* Developer */}
            <div className="space-y-3 flex flex-col items-start md:items-end">
              <a
                href="https://avnergomes.github.io/portfolio"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-neutral-400 hover:text-indigo-400 transition-colors group"
                title="Portfolio"
              >
                <img
                  src={`${import.meta.env.BASE_URL}assets/logo.png`}
                  alt="Avner Gomes"
                  className="w-8 h-8 rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
                />
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

export default App
