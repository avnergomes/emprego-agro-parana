// Estado de filtros do dashboard (contrato §6): um valor por dimensão, '' = sem filtro.
// Funções puras; o App guarda o objeto e chama setFilter/toggleFilter.
import { FILTER_KEYS } from '../engine/index.js'

export const EMPTY_FILTERS = Object.freeze(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))

export const FILTER_LABELS = {
  meso: 'Mesorregião',
  reg: 'Regional IDR',
  mun: 'Município',
  cadeia: 'Cadeia',
  cnae: 'CNAE',
  ano: 'Ano',
  periodo: 'Mês',
  sexo: 'Sexo',
  faixa: 'Faixa etária',
  escolaridade: 'Escolaridade',
  porte: 'Porte',
}

// Aplica um valor mantendo o estado coerente:
// - hierarquia mun > reg > meso: escolher município preenche regional e meso
//   (os selects ficam coerentes e nunca há recorte contraditório);
//   trocar meso limpa reg e mun; trocar reg limpa mun e ajusta meso;
// - ano e periodo são exclusivos;
// - cadeia que não contém o cnae filtrado limpa o cnae (e vice-versa ajusta a cadeia).
export function setFilter(dims, filters, key, value) {
  if (!FILTER_KEYS.includes(key)) throw new Error(`filtro desconhecido: ${key}`)
  const v = value == null ? '' : String(value)
  const next = { ...filters, [key]: v }
  if (key === 'meso') {
    next.reg = ''
    next.mun = ''
  } else if (key === 'reg') {
    next.mun = ''
    const r = v && dims.regionais.find((x) => x.nome === v)
    if (r) next.meso = r.meso
  } else if (key === 'mun' && v) {
    const m = dims.municipios.find((x) => x.cod === v)
    if (m) {
      next.reg = m.reg
      next.meso = m.meso
    }
  } else if (key === 'ano' && v) {
    next.periodo = ''
  } else if (key === 'periodo' && v) {
    next.ano = ''
  } else if (key === 'cadeia' && v && next.cnae) {
    if (cadeiaDoCnae(dims, next.cnae) !== v) next.cnae = ''
  } else if (key === 'cnae' && v && next.cadeia) {
    const c = cadeiaDoCnae(dims, v)
    if (c) next.cadeia = c
  }
  return next
}

// Clique alterna: mesmo valor limpa o filtro.
export function toggleFilter(dims, filters, key, value) {
  const v = value == null ? '' : String(value)
  return setFilter(dims, filters, key, filters[key] === v ? '' : v)
}

function cadeiaDoCnae(dims, cod) {
  const s = dims.subclasses.find((x) => x.cod === cod)
  return s ? dims.cadeias[s.cadeia]?.nome : undefined
}

// Rótulo legível do valor (município pelo nome, CNAE com descrição).
export function describeFilter(dims, key, value) {
  if (key === 'mun') return dims.municipios.find((m) => m.cod === value)?.nome || value
  if (key === 'cnae') {
    const s = dims.subclasses.find((x) => x.cod === value)
    return s ? `${s.cod} ${s.descricao}` : value
  }
  return value
}

// Filtros ativos na ordem de FILTER_KEYS, para o ActiveFilters.
export function activeFilters(dims, filters) {
  return FILTER_KEYS.filter((k) => filters[k]).map((k) => ({
    key: k,
    label: FILTER_LABELS[k],
    value: describeFilter(dims, k, filters[k]),
  }))
}

// Opções dos selects hierárquicos, sempre a partir de dims.json.
export function hierarchyOptions(dims, filters) {
  const byNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR')
  const regs = dims.regionais.filter((r) => !filters.meso || r.meso === filters.meso).sort(byNome)
  const muns = dims.municipios
    .filter((m) => (filters.reg ? m.reg === filters.reg : !filters.meso || m.meso === filters.meso))
    .sort(byNome)
  return { mesos: [...dims.mesos].sort((a, b) => a.localeCompare(b, 'pt-BR')), regs, muns }
}
