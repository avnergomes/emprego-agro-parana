import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Users, TrendingUp, TrendingDown, DollarSign, Briefcase,
  BarChart3, Layers, Factory, MapPin, Info, Activity,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { feature } from 'topojson-client'

import KpiCard from './components/KpiCard'
import ActiveFilters from './components/ActiveFilters'
import OverviewTab from './components/OverviewTab'
import CadeiaTab from './components/CadeiaTab'
import CnaeTab from './components/CnaeTab'
import PerfilTab from './components/PerfilTab'
import SalarioTab from './components/SalarioTab'
import GeoTab from './components/GeoTab'
import TempoTab from './components/TempoTab'

import { createLoader } from './engine/loader'
import { isEmptyFilters } from './engine/index'
import { EMPTY_FILTERS, setFilter, toggleFilter, activeFilters, hierarchyOptions } from './utils/filters'
import { useSlice } from './utils/useSlice'
import { formatNumber, formatCurrency, formatSigned, salTitle } from './utils/format'
import './index.css'

// Dados v2 (docs/CONTRATO-DADOS.md): dims.json + agregado.json + cubo/{regional}.json.
// Toda métrica exibida sai do motor (src/engine); o App só escolhe o recorte.
const loader = createLoader(import.meta.env.BASE_URL)

// Malha municipal (só geometria do mapa; listas de meso/regional/município vêm
// de dims.json). Primeiro a versão reduzida; em falha, o topojson completo no jsdelivr.
const TOPO_URL = 'https://datageoparana.github.io/assets/parana-municipalities.min.topojson'
const TOPO_URL_FALLBACK = 'https://cdn.jsdelivr.net/gh/datageoparana/datageoparana.github.io@main/assets/parana-municipalities.topojson'

async function fetchTopo() {
  const load = async (url) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error('TopoJSON indisponível')
    return res.json()
  }
  try {
    return await load(TOPO_URL)
  } catch {
    return load(TOPO_URL_FALLBACK)
  }
}

const formatData = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '')

const TABS = [
  { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
  { id: 'cadeia', label: 'Cadeias Produtivas', icon: Layers },
  { id: 'cnae', label: 'Atividades CNAE', icon: Factory },
  { id: 'perfil', label: 'Perfil do Trabalhador', icon: Users },
  { id: 'salario', label: 'Salários', icon: DollarSign },
  { id: 'geo', label: 'Municípios', icon: MapPin },
  { id: 'tempo', label: 'Evolução Temporal', icon: Activity },
]

const SELECT_CLS = 'px-3 py-2 text-base sm:text-sm min-h-[44px] border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'

// Carrega uma vez (e em "tentar novamente") o par dims + agregado inicial.
function useBoot(attempt) {
  const [state, setState] = useState({ attempt: -1, boot: null, error: null })
  useEffect(() => {
    let alive = true
    Promise.all([loader.loadDims(), loader.loadAgregado()]).then(
      ([dims, agregadoJson]) => {
        const { metadata, ...agregado } = agregadoJson
        if (alive) setState({ attempt, boot: { dims, agregado, metadata }, error: null })
      },
      (err) => alive && setState({ attempt, boot: null, error: err?.message || String(err) }),
    )
    return () => {
      alive = false
    }
  }, [attempt])
  return state.attempt === attempt ? state : { boot: null, error: null }
}

function useGeo(attempt) {
  const [state, setState] = useState({ attempt: -1, geo: null, error: false })
  useEffect(() => {
    let alive = true
    fetchTopo()
      .then((topo) => feature(topo, topo.objects.municipalities))
      .then(
        (geo) => alive && setState({ attempt, geo, error: false }),
        () => alive && setState({ attempt, geo: null, error: true }),
      )
    return () => {
      alive = false
    }
  }, [attempt])
  return state.attempt === attempt ? state : { geo: null, error: false }
}

function useTabScroll(ready) {
  const ref = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4 })
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const t = setTimeout(update, 0)
    return () => {
      clearTimeout(t)
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [update, ready])
  const scrollBy = (dir) => ref.current?.scrollBy({ left: dir * 160, behavior: 'smooth' })
  return { tabsRef: ref, canLeft: edges.left, canRight: edges.right, scrollTabs: scrollBy }
}

function Spinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-neutral-600" role="status" data-i18n-translate>
      <div className="animate-spin w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

function ErrorPanel({ title, detail, onRetry }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center max-w-lg mx-auto" role="alert" data-i18n-translate>
      <Info className="w-12 h-12 text-red-500 mx-auto mb-3" />
      <h2 className="text-lg font-semibold text-red-800 mb-2">{title}</h2>
      {detail && <p className="text-sm text-red-700 mb-4 break-words" data-i18n-skip>{detail}</p>}
      <button onClick={onRetry} className="px-4 py-2 min-h-[44px] rounded-lg bg-red-700 text-white hover:bg-red-800">
        Tentar novamente
      </button>
    </div>
  )
}

function App() {
  const [bootAttempt, setBootAttempt] = useState(0)
  const [geoAttempt, setGeoAttempt] = useState(0)
  const [sliceAttempt, setSliceAttempt] = useState(0)
  const { boot, error: bootError } = useBoot(bootAttempt)
  const { geo, error: geoError } = useGeo(geoAttempt)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [activeTab, setActiveTab] = useState('overview')
  const slice = useSlice(loader, boot, filters, sliceAttempt)
  const { tabsRef, canLeft, canRight, scrollTabs } = useTabScroll(Boolean(boot))

  const dims = boot?.dims
  const onToggle = useCallback((key, value) => setFilters((f) => toggleFilter(dims, f, key, value)), [dims])
  const onSet = useCallback((key, value) => setFilters((f) => setFilter(dims, f, key, value)), [dims])
  const clearAll = useCallback(() => setFilters(EMPTY_FILTERS), [])

  const cores = useMemo(() => Object.fromEntries((dims?.cadeias || []).map((c) => [c.nome, c.cor])), [dims])
  const cadeiaNomes = useMemo(() => (dims?.cadeias || []).map((c) => c.nome), [dims])
  const options = useMemo(() => (dims ? hierarchyOptions(dims, filters) : null), [dims, filters])
  const chips = useMemo(() => (dims ? activeFilters(dims, filters) : []), [dims, filters])

  if (bootError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-100">
        <ErrorPanel title="Erro ao carregar dados" detail={bootError} onRetry={() => setBootAttempt((n) => n + 1)} />
      </div>
    )
  }
  if (!boot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100">
        <Spinner label="Carregando dados..." />
      </div>
    )
  }

  const { metadata } = boot
  const agg = slice.agg
  const kpis = agg?.kpis
  const loading = slice.loading
  const movimentacoes = kpis ? kpis.acumulado.admissoes + kpis.acumulado.demissoes : null
  const vazio = kpis && kpis.acumulado.admissoes === 0 && kpis.acumulado.demissoes === 0
  const ref = kpis?.periodo_referencia || ''
  const tabProps = { agg, filters, onToggle }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-gradient-to-r from-green-800 via-green-700 to-green-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 backdrop-blur-sm rounded-xl">
                <Briefcase className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">Emprego Agrícola - Paraná</h1>
                <p className="text-green-100 text-sm">Movimentações de emprego formal na agropecuária paranaense</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-sm" data-i18n-translate>
              <div className="bg-white/10 rounded-lg px-3 py-2">
                <span className="text-green-200">Período:</span>{' '}
                <span className="font-semibold" data-i18n-skip>{metadata.periodo_inicial} a {metadata.periodo_final}</span>
              </div>
              <div className="bg-white/10 rounded-lg px-3 py-2" title="Admissões + desligamentos do recorte, com ajustes">
                <span className="text-green-200">Movimentações:</span>{' '}
                <span className="font-semibold" data-i18n-skip>{loading ? '…' : formatNumber(movimentacoes)}</span>
              </div>
              <div className="bg-white/10 rounded-lg px-3 py-2">
                <span className="text-green-200">Atualizado em</span>{' '}
                <span className="font-semibold" data-i18n-skip>{formatData(metadata.atualizacao)}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Filtros regionais (hierárquicos, a partir de dims.json) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-3 mb-3">
        <div className="bg-white rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-neutral-600">Filtrar por:</span>
          <select name="meso" value={filters.meso} onChange={(e) => onSet('meso', e.target.value)} className={SELECT_CLS} aria-label="Mesorregião">
            <option value="">Todas Mesorregiões</option>
            {options.mesos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select name="reg" value={filters.reg} onChange={(e) => onSet('reg', e.target.value)} className={SELECT_CLS} aria-label="Regional IDR">
            <option value="">Todas Regionais IDR</option>
            {options.regs.map((r) => <option key={r.nome} value={r.nome}>{r.nome}</option>)}
          </select>
          <select name="mun" value={filters.mun} onChange={(e) => onSet('mun', e.target.value)} className={`${SELECT_CLS} max-w-[220px]`} aria-label="Município">
            <option value="">Todos Municípios</option>
            {options.muns.map((m) => <option key={m.cod} value={m.cod}>{m.nome}</option>)}
          </select>
          {!isEmptyFilters(filters) && (
            <button onClick={clearAll} className="px-3 py-2 min-h-[44px] text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200">
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            title="Admissões"
            value={kpis && formatNumber(kpis.acumulado.admissoes)}
            subtitle={kpis && `${formatNumber(kpis.ultimo_mes.admissoes)} em ${ref}`}
            icon={TrendingUp}
            color="sky"
            loading={loading || !kpis}
          />
          <KpiCard
            title="Demissões"
            value={kpis && formatNumber(kpis.acumulado.demissoes)}
            subtitle={kpis && `${formatNumber(kpis.ultimo_mes.demissoes)} em ${ref}`}
            icon={TrendingDown}
            color="orange"
            loading={loading || !kpis}
          />
          <KpiCard
            title="Saldo"
            value={kpis && formatSigned(kpis.acumulado.saldo)}
            subtitle={kpis && `${formatSigned(kpis.ultimo_mes.saldo)} em ${ref}`}
            icon={Users}
            color={kpis && kpis.acumulado.saldo < 0 ? 'orange' : 'sky'}
            loading={loading || !kpis}
          />
          <KpiCard
            title="Salário Médio"
            value={kpis && formatCurrency(kpis.salario.media)}
            valueTitle={kpis && salTitle(kpis.salario.media)}
            subtitle="Admissões, regra MTE"
            icon={DollarSign}
            color="amber"
            loading={loading || !kpis}
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="relative">
          {canLeft && (
            <button
              onClick={() => scrollTabs(-1)}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-white/90 backdrop-blur-sm rounded-full shadow-md border border-neutral-200 md:hidden"
              aria-label="Rolar abas para a esquerda"
            >
              <ChevronLeft className="w-4 h-4 text-neutral-600" />
            </button>
          )}
          <div ref={tabsRef} className="flex overflow-x-auto gap-2 pb-2 scrollbar-thin" role="tablist" aria-label="Seções do dashboard">
            {TABS.map((tab) => {
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
                  className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive ? 'bg-green-600 text-white shadow-md' : 'bg-white text-neutral-600 hover:bg-green-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
          {canRight && (
            <button
              onClick={() => scrollTabs(1)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-white/90 backdrop-blur-sm rounded-full shadow-md border border-neutral-200 md:hidden"
              aria-label="Rolar abas para a direita"
            >
              <ChevronRight className="w-4 h-4 text-neutral-600" />
            </button>
          )}
        </div>
      </div>

      <main
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[60vh]"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        aria-busy={loading}
      >
        <ActiveFilters items={chips} onClear={(key) => onSet(key, '')} onClearAll={clearAll} />

        {loading ? (
          <Spinner label="Calculando o recorte selecionado..." />
        ) : slice.error ? (
          <ErrorPanel title="Não foi possível carregar os dados do recorte." detail={slice.error} onRetry={() => setSliceAttempt((n) => n + 1)} />
        ) : (
          <>
            {vazio && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4 text-sm text-amber-800" role="status" data-i18n-translate>
                Nenhuma movimentação para a combinação de filtros selecionada.
              </div>
            )}
            {filters.porte && dims.porte_indisponivel?.length > 0 && (
              <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-2.5 mb-4 text-sm text-sky-800" role="note">
                Porte do estabelecimento não informado pelo MTE em {dims.porte_indisponivel.join(', ')}: com filtro de porte, essas competências ficam fora do recorte (KPIs e séries vão até o mês anterior).
              </div>
            )}
            {activeTab === 'overview' && <OverviewTab {...tabProps} />}
            {activeTab === 'cadeia' && <CadeiaTab {...tabProps} cores={cores} />}
            {activeTab === 'cnae' && <CnaeTab {...tabProps} onSet={onSet} cadeias={cadeiaNomes} />}
            {activeTab === 'perfil' && <PerfilTab {...tabProps} porteIndisponivel={dims.porte_indisponivel} />}
            {activeTab === 'salario' && <SalarioTab {...tabProps} />}
            {activeTab === 'geo' && (
              <GeoTab
                {...tabProps}
                municipios={dims.municipios}
                geoData={geo}
                geoError={geoError}
                onRetryMap={() => setGeoAttempt((n) => n + 1)}
              />
            )}
            {activeTab === 'tempo' && <TempoTab {...tabProps} />}
          </>
        )}
      </main>

      <footer className="bg-neutral-800 text-neutral-300 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-3">
              <h4 className="text-white font-semibold text-sm flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-400" />
                Fonte de Dados
              </h4>
              <ul className="space-y-1.5 text-xs text-neutral-400">
                <li>Novo CAGED - Cadastro Geral de Empregados e Desempregados (MTE)</li>
                <li>MTE - Ministério do Trabalho e Emprego</li>
              </ul>
              <div className="text-xs text-neutral-500 pt-2 border-t border-neutral-700 space-y-1">
                <p data-i18n-translate>
                  <span>Nota metodológica:</span> <span>{metadata.nota_metodologica}</span>
                </p>
                <p>Salário médio: admissões, regra MTE (sem intermitentes, entre 0,3 e 150 salários mínimos); valores nominais.</p>
                {metadata.atualizacao && <p>Dados atualizados em {formatData(metadata.atualizacao)}</p>}
                <p>{metadata.total_cadeias} cadeias | {metadata.total_subclasses} atividades CNAE</p>
              </div>
            </div>

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
                <a href="https://avnergomes.github.io/seguranca-parana/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2.5 py-1 text-[10px] rounded-full border border-neutral-600 text-neutral-300 hover:text-indigo-300 hover:border-indigo-400 transition-colors">Segurança Paraná</a>
              </div>
            </div>

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
                  width={32}
                  height={32}
                  loading="lazy"
                  decoding="async"
                  className="w-8 h-8 rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
                />
                <span className="text-xs">Desenvolvido por Avner Gomes</span>
              </a>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-neutral-700 flex items-center justify-between text-[10px] text-neutral-500">
            <p>Emprego Agro Paraná · Dados públicos Novo CAGED/MTE</p>
            <span className="px-2 py-0.5 bg-indigo-900/50 text-indigo-300 rounded-full">
              {dims.municipios.length} municípios
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
