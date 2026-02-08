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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedCadeia, setSelectedCadeia] = useState(null)

  // Filtros globais
  const [mesoFilter, setMesoFilter] = useState('')
  const [regIdrFilter, setRegIdrFilter] = useState('')
  const [munFilter, setMunFilter] = useState('')

  useEffect(() => {
    // Carregar dados agregados e GeoJSON em paralelo
    Promise.all([
      fetch('./data/aggregated_full.json').then(res => {
        if (!res.ok) throw new Error('Dados não encontrados')
        return res.json()
      }),
      fetch(GEO_URL).then(res => res.json()).catch(() => null)
    ])
      .then(([aggData, geo]) => {
        setData(aggData)
        setGeoData(geo)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
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

  // Dados filtrados
  const filteredByMunicipio = useMemo(() => {
    if (!data) return []
    const byMunicipio = data.byMunicipio
    if (!mesoFilter && !regIdrFilter && !munFilter) return byMunicipio
    return byMunicipio.filter(m => {
      // Filtro de município específico tem prioridade
      if (munFilter) return m.codigo === munFilter
      const region = munRegionMap[m.codigo]
      if (!region) return true
      const matchesMeso = !mesoFilter || region.meso === mesoFilter
      const matchesRegIdr = !regIdrFilter || region.regIdr === regIdrFilter
      return matchesMeso && matchesRegIdr
    })
  }, [data, mesoFilter, regIdrFilter, munFilter, munRegionMap])

  const filteredTopMunicipios = useMemo(() => {
    if (!data) return []
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
  }, [data, mesoFilter, regIdrFilter, munFilter, munRegionMap])

  // KPIs recalculados com base nos municípios filtrados
  const filteredKpis = useMemo(() => {
    if (!data) return null
    const kpis = data.kpis
    if (!mesoFilter && !regIdrFilter && !munFilter) return kpis
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
  }, [data, filteredByMunicipio, mesoFilter, regIdrFilter])

  const hasFilter = mesoFilter || regIdrFilter || munFilter
  const selectedMunName = munFilter ? municipiosList.find(m => m.codigo === munFilter)?.nome : null

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
        {activeTab === 'overview' && (
          <OverviewTab
            timeseries={timeseries}
            byCadeia={byCadeia}
            bySexo={bySexo}
            byFaixaEtaria={byFaixaEtaria}
            seasonality={seasonality}
            hasFilter={hasFilter}
            filterLabel={selectedMunName || mesoFilter || regIdrFilter}
          />
        )}
        {activeTab === 'cadeia' && (
          <CadeiaTab
            byCadeia={byCadeia}
            timeseriesCadeia={timeseriesCadeia}
            crossCadeiaSexo={crossCadeiaSexo}
            selectedCadeia={selectedCadeia}
            setSelectedCadeia={setSelectedCadeia}
            hasFilter={hasFilter}
            filterLabel={selectedMunName || mesoFilter || regIdrFilter}
          />
        )}
        {activeTab === 'cnae' && (
          <CnaeTab byCnae={byCnae} byCadeia={byCadeia} hasFilter={hasFilter} filterLabel={selectedMunName || mesoFilter || regIdrFilter} />
        )}
        {activeTab === 'perfil' && (
          <PerfilTab
            bySexo={bySexo}
            byFaixaEtaria={byFaixaEtaria}
            byEscolaridade={byEscolaridade}
            byPorte={byPorte}
            kpis={filteredKpis}
            hasFilter={hasFilter}
            filterLabel={selectedMunName || mesoFilter || regIdrFilter}
          />
        )}
        {activeTab === 'salario' && (
          <SalarioTab
            salaryDistribution={salaryDistribution}
            byCadeia={byCadeia}
            byEscolaridade={byEscolaridade}
            hasFilter={hasFilter}
            filterLabel={selectedMunName || mesoFilter || regIdrFilter}
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
          />
        )}
        {activeTab === 'tempo' && (
          <TempoTab
            timeseries={timeseries}
            yearly={yearly}
            seasonality={seasonality}
            hasFilter={hasFilter}
            filterLabel={selectedMunName || mesoFilter || regIdrFilter}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-neutral-800 text-neutral-300 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <p className="font-medium">{metadata.fonte}</p>
              <p className="text-sm text-neutral-400">
                Atualização: {metadata.atualizacao} | {metadata.total_cadeias} cadeias produtivas | {metadata.total_subclasses} atividades CNAE
              </p>
            </div>
            <div className="text-sm text-neutral-400">
              {metadata.total_municipios} municípios do Paraná
            </div>
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

function FilterIndicator({ hasFilter, filterLabel, message = "Dados agregados do estado. KPIs e Municípios são filtrados." }) {
  if (!hasFilter) return null
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-4 text-sm text-green-700">
      <span className="font-medium">Filtro ativo: {filterLabel}</span>
      <span className="text-green-600 ml-2">- {message}</span>
    </div>
  )
}

// ===== TABS =====

function OverviewTab({ timeseries, byCadeia, bySexo, byFaixaEtaria, seasonality, hasFilter, filterLabel }) {
  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {/* Série Temporal */}
      <Card title="Evolução Mensal do Emprego Agrícola">
        <div className="h-80">
          <ResponsiveContainer>
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
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Cadeias */}
        <Card title="Principais Cadeias Produtivas">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={byCadeia.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="cadeia" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar dataKey="admissoes" name="Admissões" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Distribuição por Sexo */}
        <Card title="Distribuição por Sexo">
          <div className="h-72 flex items-center">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={bySexo.filter(s => s.sexo !== 'Não informado')}
                  dataKey="admissoes"
                  nameKey="sexo"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ sexo, pct }) => `${sexo}: ${pct}%`}
                >
                  <Cell fill="#3b82f6" />
                  <Cell fill="#ec4899" />
                </Pie>
                <Tooltip formatter={(v) => formatNumber(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Faixa Etária */}
        <Card title="Distribuição por Faixa Etária">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byFaixaEtaria.filter(f => f.faixa !== 'Não informado')}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="faixa" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar dataKey="admissoes" name="Admissões" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Sazonalidade */}
        <Card title="Padrão Sazonal (Média Mensal)">
          <div className="h-64">
            <ResponsiveContainer>
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

function CadeiaTab({ byCadeia, timeseriesCadeia, crossCadeiaSexo, selectedCadeia, setSelectedCadeia, hasFilter, filterLabel }) {
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
      {/* Treemap */}
      <Card title="Distribuição por Cadeia Produtiva">
        <div className="h-80">
          <ResponsiveContainer>
            <Treemap
              data={top10.map(c => ({ name: c.cadeia, size: c.admissoes, fill: c.cor }))}
              dataKey="size"
              aspectRatio={4/3}
              stroke="#fff"
              content={({ x, y, width, height, name, fill }) => (
                <g>
                  <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={2} />
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
                <tr key={c.cadeia} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.cor }} />
                      {c.cadeia}
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
          <ResponsiveContainer>
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

function CnaeTab({ byCnae, byCadeia, hasFilter, filterLabel }) {
  const [filter, setFilter] = useState('')
  const [cadeiaFilter, setCadeiaFilter] = useState('')
  const [sortCol, setSortCol] = useState('admissoes')
  const [sortDir, setSortDir] = useState('desc')

  const filtered = useMemo(() => {
    let data = byCnae.filter(c => {
      const matchText = filter === '' || c.cnae.includes(filter) || c.cadeia.toLowerCase().includes(filter.toLowerCase())
      const matchCadeia = cadeiaFilter === '' || c.cadeia === cadeiaFilter
      return matchText && matchCadeia
    })
    data.sort((a, b) => {
      let aVal = a[sortCol], bVal = b[sortCol]
      if (sortCol === 'cnae' || sortCol === 'cadeia') return sortDir === 'asc' ? (aVal || '').localeCompare(bVal || '') : (bVal || '').localeCompare(aVal || '')
      return sortDir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0)
    })
    return data
  }, [byCnae, filter, cadeiaFilter, sortCol, sortDir])

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
            value={cadeiaFilter}
            onChange={(e) => setCadeiaFilter(e.target.value)}
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

function PerfilTab({ bySexo, byFaixaEtaria, byEscolaridade, byPorte, kpis, hasFilter, filterLabel }) {
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
        {/* Sexo */}
        <Card title="Por Sexo">
          <div className="space-y-4">
            {bySexo.filter(s => s.sexo !== 'Não informado').map(s => (
              <div key={s.sexo} className="flex items-center gap-4">
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

        {/* Faixa Etária */}
        <Card title="Por Faixa Etária">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byFaixaEtaria.filter(f => f.faixa !== 'Não informado')} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="faixa" type="category" width={100} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar dataKey="admissoes" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Escolaridade */}
        <Card title="Por Escolaridade">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byEscolaridade.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="escolaridade" type="category" width={130} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Bar dataKey="admissoes" fill="#06b6d4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Porte da empresa */}
        <Card title="Por Porte da Empresa">
          <div className="h-64">
            <ResponsiveContainer>
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

function SalarioTab({ salaryDistribution, byCadeia, byEscolaridade, hasFilter, filterLabel }) {
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
      {/* Box plot style */}
      <Card title="Distribuição Salarial por Cadeia (Mediana)">
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={salarioData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${v.toLocaleString()}`} />
              <YAxis dataKey="cadeia" type="category" width={140} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="p50" name="Mediana" fill="#22c55e" />
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

      {/* Salário por escolaridade */}
      <Card title="Salário Mediano por Escolaridade">
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={byEscolaridade.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="escolaridade" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${v.toLocaleString()}`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="salario_mediana" name="Salário Mediano" fill="#f59e0b" />
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

function GeoTab({ topMunicipios, byMunicipio, metadata, geoData, mesoFilter, regIdrFilter, munFilter }) {
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
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Total de Municípios</div>
          <div className="text-2xl font-bold text-green-600">{metadata.total_municipios}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Maior Empregador</div>
          <div className="text-lg font-bold text-neutral-800">{topMunicipios[0]?.nome}</div>
          <div className="text-sm text-neutral-500">{formatNumber(topMunicipios[0]?.admissoes)} admissões</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm text-neutral-500">Top 20 representa</div>
          <div className="text-2xl font-bold text-blue-600">
            {(topMunicipios.reduce((a, m) => a + m.admissoes, 0) / byMunicipio.reduce((a, m) => a + m.admissoes, 0) * 100).toFixed(1)}%
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
          <ResponsiveContainer>
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

function TempoTab({ timeseries, yearly, seasonality, hasFilter, filterLabel }) {
  return (
    <div className="space-y-6">
      <FilterIndicator hasFilter={hasFilter} filterLabel={filterLabel} />
      {/* Série temporal completa */}
      <Card title="Série Histórica Completa (2020-2025)">
        <div className="h-80">
          <ResponsiveContainer>
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
          <ResponsiveContainer>
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
        {/* Anual */}
        <Card title="Resumo Anual">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={yearly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNumber(v)} />
                <Legend />
                <Bar dataKey="admissoes" name="Admissões" fill="#22c55e" />
                <Bar dataKey="demissoes" name="Demissões" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Sazonalidade */}
        <Card title="Padrão Sazonal">
          <div className="h-64">
            <ResponsiveContainer>
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
