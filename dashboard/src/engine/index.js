// Motor de agregação cross-filter (docs/CONTRATO-DADOS.md, §6 e §6.1).
//
// Puro (sem fetch, sem dependências). Recebe o cubo colunar decodificado
// (decodePartitions) + dims.json e devolve TODAS as saídas do §6 numa única
// passada sobre as linhas. Semântica: cada saída aplica todos os filtros,
// exceto os da sua própria dimensão (máscara de bits de falhas por linha).
//
// Convenções de saída (decisões documentadas onde o contrato é omisso):
//   - salários (média, mediana, percentis, mean) arredondados a 2 casas;
//     pct*, indice e idade_media a 1 casa; médias da sazonalidade a 2 casas;
//   - qualquer salário com n_sal < 5 sai null (LGPD);
//   - grupos categóricos só aparecem se tiverem >= 1 linha que passa na
//     máscara da saída; timeseries/yearly/seasonality cobrem todo dims.periodos,
//     exceto, com filtro de porte, as competências de dims.porte_indisponivel
//     (descartadas de todas as saídas: o MTE não informou o porte nelas);
//   - ordem: byCadeia/salaryDistribution/byCnae/byMunicipio por admissões desc
//     (empate: índice em dims); demais na ordem de dims.

export const FILTER_KEYS = ['meso', 'reg', 'mun', 'cadeia', 'cnae', 'ano', 'periodo', 'sexo', 'faixa', 'escolaridade', 'porte']

// Bits de falha. meso/reg nunca são ignorados por nenhuma saída: viram descarte
// antecipado (o reg implícito do filtro mun entra junto, ver resolveFilters).
const MUN = 1
const CAD = 2
const CNAE = 4
const ANO = 8
const PER = 16
const SEXO = 32
const FAIXA = 64
const ESC = 128
const PORTE = 256

const NONE = -2 // filtro ausente; -1 = rótulo desconhecido (nenhuma linha casa)
const MIN_N_SAL = 5
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const PERCENTIS = [['p10', 0.1], ['p25', 0.25], ['p50', 0.5], ['p75', 0.75], ['p90', 0.9]]
const COLS_I16 = ['mun', 'sub', 'per', 'mov', 'sexo', 'faixa', 'esc', 'porte', 'sbin']

const isSet = (v) => v !== undefined && v !== null && v !== ''

export function isEmptyFilters(filters) {
  return !filters || FILTER_KEYS.every((k) => !isSet(filters[k]))
}

// Arquivos de cubo necessários: mun > reg > meso (o mais específico basta);
// outro filtro sem regional -> todas as regionais; sem filtro -> [] (agregado.json).
export function requiredPartitions(dims, filters) {
  if (isEmptyFilters(filters)) return []
  const regs = dims.regionais
  if (isSet(filters.mun)) {
    const m = dims.municipios.find((x) => x.cod === String(filters.mun))
    const r = m && regs.find((x) => x.nome === m.reg)
    return r ? [r.file] : []
  }
  if (isSet(filters.reg)) return regs.filter((x) => x.nome === filters.reg).map((x) => x.file)
  if (isSet(filters.meso)) return regs.filter((x) => x.meso === filters.meso).map((x) => x.file)
  return regs.map((x) => x.file)
}

// Concatena as partições JSON colunares em TypedArrays.
export function decodePartitions(dims, jsonArray) {
  const parts = jsonArray || []
  const limits = { per: dims.periodos.length, mun: dims.municipios.length, sub: dims.subclasses.length }
  const total = parts.reduce((s, p) => s + (p.n_rows || 0), 0)
  const cube = { n_rows: total, n: new Int32Array(total), sal: new Float64Array(total), idade: new Float64Array(total) }
  for (const c of COLS_I16) cube[c] = new Int16Array(total)
  let off = 0
  for (const p of parts) {
    const k = p.n_rows || 0
    // cubo e dims de versões diferentes (aba aberta antes do deploy, cache HTTP)
    if (p.version !== undefined && dims.version && p.version !== dims.version) {
      throw new Error(`dados atualizados no servidor (cubo ${p.version}, dims ${dims.version}): recarregue a página`)
    }
    for (const [c, lim] of Object.entries(limits)) {
      const col = p[c]
      for (let j = 0; j < (col ? col.length : 0); j++) {
        if (col[j] < 0 || col[j] >= lim) throw new Error(`partição incompatível com dims: ${c}=${col[j]} fora de 0..${lim - 1}; recarregue a página`)
      }
    }
    for (const c of [...COLS_I16, 'n', 'sal', 'idade']) {
      const col = p[c]
      if (!col || col.length !== k) throw new Error(`partição inválida: coluna ${c} com ${col ? col.length : 0} linhas, esperado ${k}`)
      cube[c].set(col, off)
    }
    off += k
  }
  return cube
}

// Lookups derivados de dims, calculados uma vez por objeto dims.
const lookupCache = new WeakMap()
function lookups(dims) {
  let lk = lookupCache.get(dims)
  if (lk) return lk
  const idx = (arr, key = (x) => x) => new Map(arr.map((x, i) => [key(x), i]))
  const regIdx = idx(dims.regionais, (r) => r.nome)
  const mesoIdx = idx(dims.mesos)
  const anoOfPer = Int16Array.from(dims.periodos, (p) => Number(p.slice(0, 4)))
  lk = {
    cadOfSub: Int16Array.from(dims.subclasses, (s) => s.cadeia),
    regOfMun: Int16Array.from(dims.municipios, (m) => regIdx.get(m.reg) ?? -1),
    mesoOfMun: Int16Array.from(dims.municipios, (m) => mesoIdx.get(m.meso) ?? -1),
    anoOfPer,
    mesOfPer: Int8Array.from(dims.periodos, (p) => Number(p.slice(5, 7))),
    // competências sem porte informado pelo MTE (dims.porte_indisponivel)
    porteOff: Uint8Array.from(dims.periodos, (p) => ((dims.porte_indisponivel || []).includes(p) ? 1 : 0)),
    anos: [...new Set(anoOfPer)].sort((a, b) => a - b),
    munIdx: idx(dims.municipios, (m) => m.cod),
    subIdx: idx(dims.subclasses, (s) => s.cod),
    cadIdx: idx(dims.cadeias, (c) => c.nome),
    perIdx: idx(dims.periodos),
    regIdx,
    mesoIdx,
    sexoIdx: idx(dims.sexo),
    faixaIdx: idx(dims.faixa),
    escIdx: idx(dims.escolaridade),
    porteIdx: idx(dims.porte),
  }
  lookupCache.set(dims, lk)
  return lk
}

function resolveFilters(dims, lk, rawFilters) {
  const filters = rawFilters || {}
  const get = (map, v) => (isSet(v) ? map.get(String(v)) ?? -1 : NONE)
  const mun = get(lk.munIdx, filters.mun)
  return {
    meso: get(lk.mesoIdx, filters.meso),
    reg: get(lk.regIdx, filters.reg),
    // reg implícito do município: byMunicipio ignora mun mas fica na regional dele
    regMun: mun === NONE ? NONE : mun < 0 ? -1 : lk.regOfMun[mun],
    mun,
    cad: get(lk.cadIdx, filters.cadeia),
    cnae: get(lk.subIdx, filters.cnae),
    ano: isSet(filters.ano) ? Number(filters.ano) : NONE,
    per: get(lk.perIdx, filters.periodo),
    sexo: get(lk.sexoIdx, filters.sexo),
    faixa: get(lk.faixaIdx, filters.faixa),
    esc: get(lk.escIdx, filters.escolaridade),
    porte: get(lk.porteIdx, filters.porte),
  }
}

// Acumulador por grupo (arrays planos indexados pela chave do grupo).
function newAcc(size, nb = 0) {
  return {
    adm: new Float64Array(size),
    dem: new Float64Array(size),
    sal: new Float64Array(size),
    nsal: new Float64Array(size),
    rows: new Int32Array(size),
    nb,
    hist: nb ? new Float64Array(size * nb) : null,
  }
}

function add(a, k, nn, isAdm, b, sl) {
  if (isAdm) a.adm[k] += nn
  else a.dem[k] += nn
  a.rows[k]++
  if (b > 0) {
    a.sal[k] += sl
    a.nsal[k] += nn
    if (a.hist !== null) a.hist[k * a.nb + b] += nn
  }
}

const r1 = (x) => Math.round(x * 10) / 10
const r2 = (x) => Math.round(x * 100) / 100

// Percentil por bins (contrato §6): contagens negativas truncadas em 0;
// acumula até alcançar p·N e interpola linearmente em [E[b-1], E[b]);
// bin sem limite superior útil (b >= edges.length-1, o último) usa E[b-1].
export function binPercentile(hist, off, nb, edges, p) {
  let total = 0
  for (let b = 1; b < nb; b++) if (hist[off + b] > 0) total += hist[off + b]
  if (total <= 0) return null
  const target = p * total
  let cum = 0
  for (let b = 1; b < nb; b++) {
    const c = hist[off + b]
    if (!(c > 0)) continue
    if (cum + c >= target) {
      const lo = edges[b - 1]
      if (b >= edges.length - 1) return lo
      return lo + ((target - cum) / c) * (edges[b] - lo)
    }
    cum += c
  }
  return null
}

const salMedio = (a, k) => (a.nsal[k] >= MIN_N_SAL ? r2(a.sal[k] / a.nsal[k]) : null)
function salPct(a, k, edges, p) {
  if (a.nsal[k] < MIN_N_SAL) return null
  const v = binPercentile(a.hist, k * a.nb, a.nb, edges, p)
  return v === null ? null : r2(v)
}
const pctOf = (x, tot) => (tot > 0 ? r1((x / tot) * 100) : 0)

function movs(a, k) {
  return { admissoes: a.adm[k], demissoes: a.dem[k], saldo: a.adm[k] - a.dem[k] }
}

// Grupos com linhas, ordenados por admissões desc (empate: índice).
function rankedKeys(a, size) {
  const ks = []
  for (let k = 0; k < size; k++) if (a.rows[k] > 0) ks.push(k)
  return ks.sort((x, y) => a.adm[y] - a.adm[x] || x - y)
}

function byDim(a, labels, field, edges) {
  const ks = labels.map((_, k) => k).filter((k) => a.rows[k] > 0)
  const tot = ks.reduce((s, k) => s + a.adm[k], 0)
  return ks.map((k) => ({
    [field]: labels[k],
    ...movs(a, k),
    salario_medio: salMedio(a, k),
    salario_mediana: salPct(a, k, edges, 0.5),
    n_sal: a.nsal[k],
    pct: pctOf(a.adm[k], tot),
  }))
}

// Período de referência dos KPIs: periodo filtrado; senão o último de
// dims.periodos dentro do ano filtrado; senão o último de dims.periodos.
// Com filtro de porte, competências sem porte informado ficam fora do recorte.
function refPeriod(dims, lk, f) {
  if (f.per !== NONE) return f.per
  for (let p = dims.periodos.length - 1; p >= 0; p--) {
    if (f.porte !== NONE && lk.porteOff[p]) continue
    if (f.ano === NONE || lk.anoOfPer[p] === f.ano) return p
  }
  return -1
}

export function aggregate(cube, dims, filters) {
  const lk = lookups(dims)
  const f = resolveFilters(dims, lk, filters)
  const edges = dims.sal_edges
  const nb = edges.length + 1 // índices 0..edges.length (folga para bin aberto)
  const nMun = dims.municipios.length
  const nSub = dims.subclasses.length
  const nCad = dims.cadeias.length
  const nPer = dims.periodos.length
  const nSexo = dims.sexo.length
  const { cadOfSub, regOfMun, mesoOfMun, anoOfPer } = lk
  const semPorte = f.porte !== NONE ? lk.porteOff : null
  const sexoMasc = lk.sexoIdx.get('Masculino') ?? -1
  const sexoNI = lk.sexoIdx.get('Não informado') ?? -1
  const faixaNI = lk.faixaIdx.get('Não informado') ?? -1

  const ref = refPeriod(dims, lk, f)
  const kpi = newAcc(1, nb)
  const ultimo = newAcc(1)
  const cadA = newAcc(nCad, nb)
  const crossA = newAcc(nCad * nSexo)
  const cnaeA = newAcc(nSub, nb)
  const sexoA = newAcc(nSexo, nb)
  const faixaA = newAcc(dims.faixa.length, nb)
  const escA = newAcc(dims.escolaridade.length, nb)
  const porteA = newAcc(dims.porte.length, nb)
  const munA = newAcc(nMun)
  const perA = newAcc(nPer, nb)
  const perCadA = newAcc(nPer * nCad)
  const munCadAdm = new Float64Array(nMun * nCad)
  const cadMunSeen = new Uint8Array(nCad * nMun)
  const cadSubSeen = new Uint8Array(nSub)
  const subMunSeen = new Uint8Array(nSub * nMun)
  let admMasc = 0
  let admSexoInf = 0
  let idadeSum = 0
  let nIdade = 0

  const { mun, sub, per, mov, sexo, faixa, esc, porte, sbin, n, sal, idade } = cube
  const N = cube.n_rows
  for (let i = 0; i < N; i++) {
    const m = mun[i]
    // descarte antecipado: filtros que nenhuma saída ignora
    if (f.reg !== NONE && regOfMun[m] !== f.reg) continue
    if (f.regMun !== NONE && regOfMun[m] !== f.regMun) continue
    if (f.meso !== NONE && mesoOfMun[m] !== f.meso) continue
    const p = per[i]
    if (semPorte !== null && semPorte[p]) continue
    const s = sub[i]
    const c = cadOfSub[s]
    const sx = sexo[i]
    const fx = faixa[i]
    const e = esc[i]
    const po = porte[i]
    let fail = 0
    if (f.mun !== NONE && m !== f.mun) fail |= MUN
    if (f.cad !== NONE && c !== f.cad) fail |= CAD
    if (f.cnae !== NONE && s !== f.cnae) fail |= CNAE
    if (f.ano !== NONE && anoOfPer[p] !== f.ano) fail |= ANO
    if (f.per !== NONE && p !== f.per) fail |= PER
    if (f.sexo !== NONE && sx !== f.sexo) fail |= SEXO
    if (f.faixa !== NONE && fx !== f.faixa) fail |= FAIXA
    if (f.esc !== NONE && e !== f.esc) fail |= ESC
    if (f.porte !== NONE && po !== f.porte) fail |= PORTE
    const nn = n[i]
    const isAdm = mov[i] === 1
    const b = sbin[i]
    const sl = sal[i]

    if (fail === 0) {
      add(kpi, 0, nn, isAdm, b, sl)
      if (p === ref) add(ultimo, 0, nn, isAdm, b, sl)
      if (isAdm) {
        if (sx === sexoMasc) admMasc += nn
        if (sx !== sexoNI) admSexoInf += nn
        if (fx !== faixaNI) {
          idadeSum += idade[i]
          nIdade += nn
        }
      }
    }
    if ((fail & ~(CAD | CNAE)) === 0) {
      add(cadA, c, nn, isAdm, b, sl)
      cadMunSeen[c * nMun + m] = 1
      cadSubSeen[s] = 1
    }
    if ((fail & ~(CAD | CNAE | SEXO)) === 0) add(crossA, c * nSexo + sx, nn, isAdm, b, sl)
    if ((fail & ~CNAE) === 0) {
      add(cnaeA, s, nn, isAdm, b, sl)
      subMunSeen[s * nMun + m] = 1
    }
    if ((fail & ~SEXO) === 0) add(sexoA, sx, nn, isAdm, b, sl)
    if ((fail & ~FAIXA) === 0) add(faixaA, fx, nn, isAdm, b, sl)
    if ((fail & ~ESC) === 0) add(escA, e, nn, isAdm, b, sl)
    if ((fail & ~PORTE) === 0) add(porteA, po, nn, isAdm, b, sl)
    if ((fail & ~MUN) === 0) {
      add(munA, m, nn, isAdm, b, sl)
      if (isAdm) munCadAdm[m * nCad + c] += nn
    }
    if ((fail & ~(ANO | PER)) === 0) {
      add(perA, p, nn, isAdm, b, sl)
      add(perCadA, p * nCad + c, nn, isAdm, b, sl)
    }
  }

  // ---- montagem das saídas ----
  const cadeias = dims.cadeias
  const kpis = {
    periodo_referencia: ref >= 0 ? dims.periodos[ref] : null,
    ultimo_mes: movs(ultimo, 0),
    acumulado: movs(kpi, 0),
    salario: { media: salMedio(kpi, 0), mediana: salPct(kpi, 0, edges, 0.5), n: kpi.nsal[0] },
    perfil: {
      pct_masculino: admSexoInf > 0 ? r1((admMasc / admSexoInf) * 100) : null,
      idade_media: nIdade > 0 ? r1(idadeSum / nIdade) : null,
    },
  }

  let acum = 0
  const timeseries = []
  dims.periodos.forEach((periodo, p) => {
    if (semPorte !== null && semPorte[p]) return
    acum += perA.adm[p] - perA.dem[p]
    timeseries.push({
      periodo,
      ...movs(perA, p),
      saldo_acumulado: acum,
      salario_medio: salMedio(perA, p),
      salario_mediana: salPct(perA, p, edges, 0.5),
      n_sal: perA.nsal[p],
    })
  })

  // yearly e sazonalidade derivam dos acumuladores por período
  const yA = newAcc(lk.anos.length)
  const sA = newAcc(12)
  const anosNoMes = new Int32Array(12)
  for (let p = 0; p < nPer; p++) {
    const y = lk.anos.indexOf(anoOfPer[p])
    const mm = lk.mesOfPer[p] - 1
    yA.adm[y] += perA.adm[p]
    yA.dem[y] += perA.dem[p]
    yA.sal[y] += perA.sal[p]
    yA.nsal[y] += perA.nsal[p]
    sA.adm[mm] += perA.adm[p]
    sA.dem[mm] += perA.dem[p]
    if (semPorte === null || !semPorte[p]) anosNoMes[mm]++
  }
  const yearly = lk.anos.map((ano, y) => ({ ano, ...movs(yA, y), salario_medio: salMedio(yA, y), n_sal: yA.nsal[y] }))
  const mediaMes = MESES.map((_, k) => (anosNoMes[k] > 0 ? sA.adm[k] / anosNoMes[k] : 0))
  const mesesComDados = anosNoMes.filter((x) => x > 0).length
  const mediaGeral = mesesComDados > 0 ? mediaMes.reduce((s, x) => s + x, 0) / mesesComDados : 0
  const seasonality = MESES.map((mes_nome, k) => {
    const div = anosNoMes[k] || 1
    return {
      mes: k + 1,
      mes_nome,
      admissoes: r2(sA.adm[k] / div),
      demissoes: r2(sA.dem[k] / div),
      saldo: r2((sA.adm[k] - sA.dem[k]) / div),
      indice: mediaGeral > 0 ? r1((mediaMes[k] / mediaGeral) * 100) : 0,
    }
  })

  const cadKeys = rankedKeys(cadA, nCad)
  const cadTot = cadKeys.reduce((s, k) => s + cadA.adm[k], 0)
  const count = (seen, off, len) => {
    let t = 0
    for (let j = off; j < off + len; j++) t += seen[j]
    return t
  }
  const subCountByCad = new Int32Array(nCad)
  for (let s = 0; s < nSub; s++) if (cadSubSeen[s]) subCountByCad[cadOfSub[s]]++
  const byCadeia = cadKeys.map((k) => ({
    cadeia: cadeias[k].nome,
    cor: cadeias[k].cor,
    descricao: cadeias[k].descricao,
    ...movs(cadA, k),
    salario_medio: salMedio(cadA, k),
    salario_mediana: salPct(cadA, k, edges, 0.5),
    n_sal: cadA.nsal[k],
    n_subclasses: subCountByCad[k],
    n_municipios: count(cadMunSeen, k * nMun, nMun),
    pct_admissoes: pctOf(cadA.adm[k], cadTot),
  }))
  const salaryDistribution = cadKeys.map((k) => {
    const d = { cadeia: cadeias[k].nome }
    for (const [name, p] of PERCENTIS) d[name] = salPct(cadA, k, edges, p)
    d.mean = salMedio(cadA, k)
    d.n_sal = cadA.nsal[k]
    return d
  })

  const byCnae = rankedKeys(cnaeA, nSub).map((k) => {
    const sc = dims.subclasses[k]
    return {
      cnae: sc.cod,
      descricao: sc.descricao,
      cadeia: cadeias[sc.cadeia].nome,
      ...movs(cnaeA, k),
      salario_medio: salMedio(cnaeA, k),
      salario_mediana: salPct(cnaeA, k, edges, 0.5),
      n_sal: cnaeA.nsal[k],
      n_municipios: count(subMunSeen, k * nMun, nMun),
    }
  })

  const byMunicipio = rankedKeys(munA, nMun).map((k) => {
    const mu = dims.municipios[k]
    let dom = -1
    for (let c = 0; c < nCad; c++) {
      if (munCadAdm[k * nCad + c] > 0 && (dom < 0 || munCadAdm[k * nCad + c] > munCadAdm[k * nCad + dom])) dom = c
    }
    return {
      codigo: mu.cod,
      nome: mu.nome,
      reg: mu.reg,
      meso: mu.meso,
      ...movs(munA, k),
      salario_medio: salMedio(munA, k),
      n_sal: munA.nsal[k],
      cadeia_dominante: dom >= 0 ? cadeias[dom].nome : null,
    }
  })

  const crossCadeiaSexo = []
  for (let c = 0; c < nCad; c++) {
    for (let sx = 0; sx < nSexo; sx++) {
      const k = c * nSexo + sx
      if (crossA.rows[k] === 0) continue
      crossCadeiaSexo.push({ cadeia: cadeias[c].nome, sexo: dims.sexo[sx], ...movs(crossA, k), salario_medio: salMedio(crossA, k), n_sal: crossA.nsal[k] })
    }
  }

  const timeseriesCadeia = []
  for (let p = 0; p < nPer; p++) {
    for (let c = 0; c < nCad; c++) {
      const k = p * nCad + c
      if (perCadA.rows[k] > 0) timeseriesCadeia.push({ periodo: dims.periodos[p], cadeia: cadeias[c].nome, ...movs(perCadA, k) })
    }
  }

  return {
    kpis,
    timeseries,
    yearly,
    seasonality,
    byCadeia,
    byCnae,
    byMunicipio,
    topMunicipios: byMunicipio.slice(0, 20),
    bySexo: byDim(sexoA, dims.sexo, 'sexo', edges),
    byFaixaEtaria: byDim(faixaA, dims.faixa, 'faixa', edges),
    byEscolaridade: byDim(escA, dims.escolaridade, 'escolaridade', edges),
    byPorte: byDim(porteA, dims.porte, 'porte', edges),
    crossCadeiaSexo,
    timeseriesCadeia,
    salaryDistribution,
  }
}
