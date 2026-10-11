// Testes do motor: compara aggregate() com uma referência por força bruta
// (um laço ingênuo por saída, sem reaproveitar código do motor) em dezenas de
// combinações de filtros sobre o cubo sintético.
import test from 'node:test'
import assert from 'node:assert/strict'
import { FILTER_KEYS, aggregate, binPercentile, decodePartitions, isEmptyFilters, requiredPartitions } from '../index.js'
import { SAL_EDGES, makeDims, makePartitions, rng } from './fixture.mjs'

const dims = makeDims()
const partsByFile = makePartitions(dims)
const files = dims.regionais.map((g) => g.file)
const fullCube = decodePartitions(dims, files.map((f) => partsByFile[f]))

// ---------------- referência por força bruta ----------------
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d

// linhas com rótulos legíveis, na mesma ordem do cubo concatenado
const rows = []
for (const f of files) {
  const p = partsByFile[f]
  for (let i = 0; i < p.n_rows; i++) {
    const mu = dims.municipios[p.mun[i]]
    const sc = dims.subclasses[p.sub[i]]
    const periodo = dims.periodos[p.per[i]]
    rows.push({
      meso: mu.meso,
      reg: mu.reg,
      mun: mu.cod,
      cadeia: dims.cadeias[sc.cadeia].nome,
      cnae: sc.cod,
      ano: periodo.slice(0, 4),
      periodo,
      sexo: dims.sexo[p.sexo[i]],
      faixa: dims.faixa[p.faixa[i]],
      escolaridade: dims.escolaridade[p.esc[i]],
      porte: dims.porte[p.porte[i]],
      mov: p.mov[i],
      sbin: p.sbin[i],
      n: p.n[i],
      sal: p.sal[i],
      idade: p.idade[i],
    })
  }
}

function passa(row, filters, ignorados, regImplicito = false) {
  for (const k of FILTER_KEYS) {
    const v = filters[k]
    if (v === undefined || v === null || v === '' || ignorados.includes(k)) continue
    if (row[k] !== String(v)) return false
  }
  if (regImplicito && filters.mun) {
    const mu = dims.municipios.find((m) => m.cod === filters.mun)
    if (!mu || row.reg !== mu.reg) return false
  }
  return true
}

function grupos(filters, ignorados, chave, regImplicito = false) {
  const g = new Map()
  for (const row of rows) {
    if (!passa(row, filters, ignorados, regImplicito)) continue
    const k = chave(row)
    if (!g.has(k)) g.set(k, { adm: 0, dem: 0, sal: 0, nsal: 0, hist: new Array(SAL_EDGES.length + 1).fill(0), muns: new Set(), subs: new Set(), cads: {} })
    const a = g.get(k)
    if (row.mov === 1) a.adm += row.n
    else a.dem += row.n
    if (row.sbin > 0) {
      a.sal += row.sal
      a.nsal += row.n
      a.hist[row.sbin] += row.n
    }
    a.muns.add(row.mun)
    a.subs.add(row.cnae)
    if (row.mov === 1) a.cads[row.cadeia] = (a.cads[row.cadeia] || 0) + row.n
  }
  return g
}

function refPct(hist, p) {
  const c = hist.map((x, b) => (b === 0 ? 0 : Math.max(0, x)))
  const N = c.reduce((s, x) => s + x, 0)
  if (N <= 0) return null
  const alvo = p * N
  let cum = 0
  for (let b = 1; b < c.length; b++) {
    if (c[b] === 0) continue
    if (cum + c[b] >= alvo) {
      const lo = SAL_EDGES[b - 1]
      return b >= SAL_EDGES.length - 1 ? lo : lo + ((alvo - cum) / c[b]) * (SAL_EDGES[b] - lo)
    }
    cum += c[b]
  }
  return null
}

const media = (a) => (a && a.nsal >= 5 ? round(a.sal / a.nsal, 2) : null)
const pctSal = (a, p) => {
  if (!a || a.nsal < 5) return null
  const v = refPct(a.hist, p)
  return v === null ? null : round(v, 2)
}
const mov3 = (a) => ({ admissoes: a ? a.adm : 0, demissoes: a ? a.dem : 0, saldo: a ? a.adm - a.dem : 0 })
const ordemAdm = (g, ordem) => [...g.keys()].sort((x, y) => g.get(y).adm - g.get(x).adm || ordem.indexOf(x) - ordem.indexOf(y))
const pctDe = (x, tot) => (tot > 0 ? round((x / tot) * 100, 1) : 0)

function referencia(filters) {
  const nomesCad = dims.cadeias.map((c) => c.nome)
  // KPIs (todos os filtros)
  const tudo = grupos(filters, [], () => 'k').get('k')
  let ref = null
  if (filters.periodo) ref = dims.periodos.includes(filters.periodo) ? filters.periodo : null
  else ref = [...dims.periodos].reverse().find((p) => !filters.ano || p.startsWith(`${filters.ano}-`)) ?? null
  const ult = grupos(filters, [], (r) => r.periodo).get(ref)
  let masc = 0
  let inf = 0
  let idade = 0
  let nIdade = 0
  for (const row of rows) {
    if (!passa(row, filters, []) || row.mov !== 1) continue
    if (row.sexo === 'Masculino') masc += row.n
    if (row.sexo !== 'Não informado') inf += row.n
    if (row.faixa !== 'Não informado') {
      idade += row.idade
      nIdade += row.n
    }
  }
  const kpis = {
    periodo_referencia: ref,
    ultimo_mes: mov3(ult),
    acumulado: mov3(tudo),
    salario: { media: media(tudo), mediana: pctSal(tudo, 0.5), n: tudo ? tudo.nsal : 0 },
    perfil: { pct_masculino: inf > 0 ? round((masc / inf) * 100, 1) : null, idade_media: nIdade > 0 ? round(idade / nIdade, 1) : null },
  }

  // séries temporais (ignoram ano/periodo)
  const tempo = ['ano', 'periodo']
  const gp = grupos(filters, tempo, (r) => r.periodo)
  let acum = 0
  const timeseries = dims.periodos.map((periodo) => {
    const a = gp.get(periodo)
    acum += a ? a.adm - a.dem : 0
    return { periodo, ...mov3(a), saldo_acumulado: acum, salario_medio: media(a), salario_mediana: pctSal(a, 0.5), n_sal: a ? a.nsal : 0 }
  })
  const anos = [...new Set(dims.periodos.map((p) => p.slice(0, 4)))]
  const gy = grupos(filters, tempo, (r) => r.ano)
  const yearly = anos.map((ano) => {
    // soma por período para seguir a mesma ordem de soma de ponto flutuante
    const a = { adm: 0, dem: 0, sal: 0, nsal: 0 }
    for (const p of dims.periodos.filter((x) => x.startsWith(ano))) {
      const q = gp.get(p)
      if (!q) continue
      a.adm += q.adm
      a.dem += q.dem
      a.sal += q.sal
      a.nsal += q.nsal
    }
    assert.equal(a.adm, gy.get(ano)?.adm ?? 0)
    return { ano: Number(ano), ...mov3(a), salario_medio: media(a), n_sal: a.nsal }
  })
  const anosMes = MESES.map((_, k) => dims.periodos.filter((p) => Number(p.slice(5)) === k + 1).length)
  const somaMes = MESES.map((_, k) => {
    let adm = 0
    let dem = 0
    for (const p of dims.periodos) {
      if (Number(p.slice(5)) !== k + 1 || !gp.get(p)) continue
      adm += gp.get(p).adm
      dem += gp.get(p).dem
    }
    return { adm, dem }
  })
  const medias = somaMes.map((s, k) => (anosMes[k] ? s.adm / anosMes[k] : 0))
  const mesesValidos = anosMes.filter((x) => x > 0).length
  const mediaGeral = medias.reduce((s, x) => s + x, 0) / mesesValidos
  const seasonality = MESES.map((mes_nome, k) => {
    const d = anosMes[k] || 1
    const s = somaMes[k]
    return { mes: k + 1, mes_nome, admissoes: round(s.adm / d, 2), demissoes: round(s.dem / d, 2), saldo: round((s.adm - s.dem) / d, 2), indice: mediaGeral > 0 ? round((medias[k] / mediaGeral) * 100, 1) : 0 }
  })

  // cadeia
  const gc = grupos(filters, ['cadeia', 'cnae'], (r) => r.cadeia)
  const ordCad = ordemAdm(gc, nomesCad)
  const totCad = ordCad.reduce((s, k) => s + gc.get(k).adm, 0)
  const byCadeia = ordCad.map((nome) => {
    const a = gc.get(nome)
    const c = dims.cadeias.find((x) => x.nome === nome)
    return { cadeia: nome, cor: c.cor, descricao: c.descricao, ...mov3(a), salario_medio: media(a), salario_mediana: pctSal(a, 0.5), n_sal: a.nsal, n_subclasses: a.subs.size, n_municipios: a.muns.size, pct_admissoes: pctDe(a.adm, totCad) }
  })
  const salaryDistribution = ordCad.map((nome) => {
    const a = gc.get(nome)
    return { cadeia: nome, p10: pctSal(a, 0.1), p25: pctSal(a, 0.25), p50: pctSal(a, 0.5), p75: pctSal(a, 0.75), p90: pctSal(a, 0.9), mean: media(a), n_sal: a.nsal }
  })

  const gs = grupos(filters, ['cnae'], (r) => r.cnae)
  const byCnae = ordemAdm(gs, dims.subclasses.map((s) => s.cod)).map((cod) => {
    const a = gs.get(cod)
    const sc = dims.subclasses.find((s) => s.cod === cod)
    return { cnae: cod, descricao: sc.descricao, cadeia: nomesCad[sc.cadeia], ...mov3(a), salario_medio: media(a), salario_mediana: pctSal(a, 0.5), n_sal: a.nsal, n_municipios: a.muns.size }
  })

  const gm = grupos(filters, ['mun'], (r) => r.mun, true)
  const byMunicipio = ordemAdm(gm, dims.municipios.map((m) => m.cod)).map((cod) => {
    const a = gm.get(cod)
    const mu = dims.municipios.find((m) => m.cod === cod)
    let dom = null
    for (const nome of nomesCad) if ((a.cads[nome] || 0) > 0 && (dom === null || a.cads[nome] > a.cads[dom])) dom = nome
    return { codigo: cod, nome: mu.nome, reg: mu.reg, meso: mu.meso, ...mov3(a), salario_medio: media(a), n_sal: a.nsal, cadeia_dominante: dom }
  })

  const porDim = (campo, rotulos) => {
    const g = grupos(filters, [campo], (r) => r[campo])
    const ks = rotulos.filter((x) => g.has(x))
    const tot = ks.reduce((s, k) => s + g.get(k).adm, 0)
    return ks.map((k) => {
      const a = g.get(k)
      return { [campo]: k, ...mov3(a), salario_medio: media(a), salario_mediana: pctSal(a, 0.5), n_sal: a.nsal, pct: pctDe(a.adm, tot) }
    })
  }

  const gx = grupos(filters, ['cadeia', 'cnae', 'sexo'], (r) => `${r.cadeia}|${r.sexo}`)
  const crossCadeiaSexo = []
  for (const c of nomesCad) {
    for (const s of dims.sexo) {
      const a = gx.get(`${c}|${s}`)
      if (a) crossCadeiaSexo.push({ cadeia: c, sexo: s, ...mov3(a), salario_medio: media(a), n_sal: a.nsal })
    }
  }
  const gt = grupos(filters, tempo, (r) => `${r.periodo}|${r.cadeia}`)
  const timeseriesCadeia = []
  for (const p of dims.periodos) {
    for (const c of nomesCad) {
      const a = gt.get(`${p}|${c}`)
      if (a) timeseriesCadeia.push({ periodo: p, cadeia: c, ...mov3(a) })
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
    bySexo: porDim('sexo', dims.sexo),
    byFaixaEtaria: porDim('faixa', dims.faixa),
    byEscolaridade: porDim('escolaridade', dims.escolaridade),
    byPorte: porDim('porte', dims.porte),
    crossCadeiaSexo,
    timeseriesCadeia,
    salaryDistribution,
  }
}

// ---------------- casos ----------------
const VALORES = {
  meso: dims.mesos,
  reg: dims.regionais.map((g) => g.nome),
  mun: dims.municipios.map((m) => m.cod),
  cadeia: dims.cadeias.map((c) => c.nome),
  cnae: dims.subclasses.map((s) => s.cod),
  ano: ['2020', '2021', '2022'],
  periodo: ['2020-01', '2021-07', '2022-05', '2022-02'],
  sexo: dims.sexo,
  faixa: dims.faixa,
  escolaridade: dims.escolaridade,
  porte: dims.porte,
}

const FIXOS = [
  {},
  { mun: '410010' },
  { mun: '410060', cadeia: 'Avicultura' },
  { mun: '411570' }, // município sem movimentação
  { ano: '2022' }, // ano parcial
  { periodo: '2021-03', sexo: 'Feminino' },
  { reg: 'Cornélio Procópio', faixa: 'Não informado' },
  { meso: 'Sul', porte: 'De 5 a 9' },
  { cnae: '0155505' }, // subclasse rara: amostras com n_sal < 5
  { cadeia: 'Grãos', cnae: '0115600' }, // cnae fora da cadeia: KPIs vazios
  { cadeia: 'Inexistente' },
  { ano: '1999' },
  { mun: '410010', reg: 'Londrina' }, // hierarquia inconsistente: vazio
  { sexo: 'Não informado', escolaridade: 'Superior Completo' },
]

function casosAleatorios(qtd, seed) {
  const r = rng(seed)
  const out = []
  for (let i = 0; i < qtd; i++) {
    const f = {}
    const k = 1 + Math.floor(r() * 4)
    for (let j = 0; j < k; j++) {
      const key = FILTER_KEYS[Math.floor(r() * FILTER_KEYS.length)]
      if (key === 'ano') delete f.periodo
      if (key === 'periodo') delete f.ano
      const vals = VALORES[key]
      f[key] = vals[Math.floor(r() * vals.length)]
    }
    out.push(f)
  }
  return out
}

const CASOS = [...FIXOS, ...casosAleatorios(60, 7)]

test('aggregate == referência por força bruta em todas as combinações', () => {
  for (const filters of CASOS) {
    assert.deepStrictEqual(aggregate(fullCube, dims, filters), referencia(filters), JSON.stringify(filters))
  }
})

test('carregar só requiredPartitions dá o mesmo resultado que o cubo inteiro', () => {
  for (const filters of CASOS) {
    const req = requiredPartitions(dims, filters)
    if (isEmptyFilters(filters)) {
      assert.deepEqual(req, [])
      continue
    }
    const cube = decodePartitions(dims, req.map((f) => partsByFile[f]))
    // a ordem de soma muda entre cubos; compara com tolerância numérica
    assertClose(aggregate(cube, dims, filters), aggregate(fullCube, dims, filters), JSON.stringify(filters))
  }
})

function assertClose(a, b, msg, path = '') {
  if (typeof a === 'number' && typeof b === 'number') {
    assert.ok(Math.abs(a - b) <= 0.011 + 1e-9 * Math.abs(b), `${msg} ${path}: ${a} != ${b}`)
    return
  }
  if (a && typeof a === 'object') {
    assert.deepEqual(Object.keys(a), Object.keys(b), `${msg} ${path}`)
    for (const k of Object.keys(a)) assertClose(a[k], b[k], msg, `${path}.${k}`)
    return
  }
  assert.equal(a, b, `${msg} ${path}`)
}

test('requiredPartitions: mun > reg > meso; outros filtros -> todas', () => {
  assert.deepEqual(requiredPartitions(dims, {}), [])
  assert.deepEqual(requiredPartitions(dims, { ano: '', sexo: null }), [])
  assert.deepEqual(requiredPartitions(dims, { mun: '410060', meso: 'Sul' }), ['londrina.json'])
  assert.deepEqual(requiredPartitions(dims, { reg: 'União da Vitória' }), ['uniao-da-vitoria.json'])
  assert.deepEqual(requiredPartitions(dims, { meso: 'Norte' }), ['cornelio-procopio.json', 'londrina.json'])
  assert.deepEqual(requiredPartitions(dims, { cadeia: 'Grãos' }), files)
  assert.deepEqual(requiredPartitions(dims, { mun: '999999' }), [])
})

test('byMunicipio com mun: mostra a regional do município, não o estado', () => {
  const out = aggregate(fullCube, dims, { mun: '410010' })
  assert.deepEqual(new Set(out.byMunicipio.map((m) => m.reg)), new Set(['Cornélio Procópio']))
  assert.ok(out.byMunicipio.some((m) => m.codigo === '410640'))
  assert.equal(out.bySexo.reduce((s, x) => s + x.admissoes, 0), out.kpis.acumulado.admissoes)
})

test('cobertura do cubo sintético: pesos negativos, n_sal < 5, último bin, acentos', () => {
  const out = aggregate(fullCube, dims, {})
  assert.ok(fullCube.n.some((x) => x < 0))
  assert.ok(fullCube.sbin.some((x) => x === 26))
  const pequenos = CASOS.flatMap((f) => aggregate(fullCube, dims, f).byCnae).filter((x) => x.n_sal > 0 && x.n_sal < 5)
  assert.ok(pequenos.length > 0 && pequenos.every((x) => x.salario_medio === null && x.salario_mediana === null))
  assert.ok(out.byCadeia.some((c) => c.cadeia === 'Grãos'))
  assert.ok(out.byMunicipio.some((m) => m.nome === 'Abatiá' && m.reg === 'Cornélio Procópio'))
  assert.ok(!out.byMunicipio.some((m) => m.codigo === '411570'))
  assert.equal(out.seasonality.length, 12)
  // jan..mai aparecem em 3 anos, jun..dez em 2
  const jan = aggregate(fullCube, dims, {}).timeseries.filter((t) => t.periodo.endsWith('-01')).reduce((s, t) => s + t.admissoes, 0)
  assert.equal(out.seasonality[0].admissoes, Math.round((jan / 3) * 100) / 100)
})

test('todas as medidas são number ou null (nunca string)', () => {
  const ROTULOS = new Set(['periodo_referencia', 'periodo', 'cadeia', 'cor', 'descricao', 'cnae', 'codigo', 'nome', 'reg', 'meso', 'cadeia_dominante', 'sexo', 'faixa', 'escolaridade', 'porte', 'mes_nome'])
  const walk = (v, k) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, k))
    if (v && typeof v === 'object') return Object.entries(v).forEach(([kk, x]) => walk(x, kk))
    if (!ROTULOS.has(k)) assert.ok(v === null || (typeof v === 'number' && Number.isFinite(v)), `${k}=${v}`)
  }
  for (const f of CASOS) walk(aggregate(fullCube, dims, f), '')
})

test('binPercentile: trunca negativos, interpola e não extrapola no último bin', () => {
  const nb = SAL_EDGES.length + 1
  const h = new Float64Array(nb)
  h[1] = 2 // [0, 1000)
  h[2] = -1 // truncado em 0
  h[3] = 2 // [1100, 1200)
  assert.equal(binPercentile(h, 0, nb, SAL_EDGES, 0.5), 1000)
  assert.equal(binPercentile(h, 0, nb, SAL_EDGES, 0.75), 1150)
  assert.equal(binPercentile(h, 0, nb, SAL_EDGES, 0.1), 200)
  const u = new Float64Array(nb)
  u[26] = 5
  assert.equal(binPercentile(u, 0, nb, SAL_EDGES, 0.9), 50000)
  u[27] = 100 // bin aberto acima de 250000, se o pipeline emitir
  assert.equal(binPercentile(u, 0, nb, SAL_EDGES, 0.9), 250000)
  assert.equal(binPercentile(new Float64Array(nb), 0, nb, SAL_EDGES, 0.5), null)
})

test('decodePartitions valida tamanho das colunas e concatena', () => {
  const cube = decodePartitions(dims, files.map((f) => partsByFile[f]))
  assert.equal(cube.n_rows, rows.length)
  assert.ok(cube.mun instanceof Int16Array && cube.n instanceof Int32Array && cube.sal instanceof Float64Array)
  assert.throws(() => decodePartitions(dims, [{ ...partsByFile[files[0]], n_rows: 1e6 }]), /partição inválida/)
  assert.equal(decodePartitions(dims, []).n_rows, 0)
})

test('decodePartitions recusa partição de outra versão ou com índice fora de dims', () => {
  const p = partsByFile[files[0]]
  assert.throws(() => decodePartitions(dims, [{ ...p, version: '1999-01-01' }]), /recarregue/)
  assert.throws(() => decodePartitions({ ...dims, periodos: dims.periodos.slice(0, 1) }, [p]), /per=/)
})

test('porte_indisponivel: com filtro de porte a competência sai do recorte', () => {
  const ultimo = dims.periodos[dims.periodos.length - 1]
  const d2 = { ...dims, porte_indisponivel: [ultimo] }
  const out = aggregate(fullCube, d2, { porte: dims.porte[1] })
  assert.equal(out.kpis.periodo_referencia, dims.periodos[dims.periodos.length - 2])
  assert.ok(!out.timeseries.some((t) => t.periodo === ultimo))
  assert.equal(aggregate(fullCube, d2, {}).kpis.periodo_referencia, ultimo)
})
