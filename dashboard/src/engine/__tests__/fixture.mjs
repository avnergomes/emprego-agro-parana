// Cubo SINTÉTICO pequeno + dims no formato do contrato (§3/§4), determinístico.
export const SAL_EDGES = [0, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2200, 2400, 2600, 2800, 3000, 3500, 4000, 5000, 6000, 8000, 10000, 15000, 25000, 50000, 250000]

export function makeDims() {
  const regionais = [
    { nome: 'Cornélio Procópio', slug: 'cornelio-procopio', meso: 'Norte', file: 'cornelio-procopio.json', bytes: 0 },
    { nome: 'Londrina', slug: 'londrina', meso: 'Norte', file: 'londrina.json', bytes: 0 },
    { nome: 'União da Vitória', slug: 'uniao-da-vitoria', meso: 'Sul', file: 'uniao-da-vitoria.json', bytes: 0 },
  ]
  const municipios = [
    { cod: '410010', nome: 'Abatiá', reg: 'Cornélio Procópio', meso: 'Norte' },
    { cod: '410640', nome: 'Cornélio Procópio', reg: 'Cornélio Procópio', meso: 'Norte' },
    { cod: '411370', nome: 'Londrina', reg: 'Londrina', meso: 'Norte' },
    { cod: '410060', nome: 'Assaí', reg: 'Londrina', meso: 'Norte' },
    { cod: '412810', nome: 'União da Vitória', reg: 'União da Vitória', meso: 'Sul' },
    { cod: '412170', nome: 'São Mateus do Sul', reg: 'União da Vitória', meso: 'Sul' },
    { cod: '411570', nome: 'Nova Laranjeiras', reg: 'União da Vitória', meso: 'Sul' }, // sem movimentação
  ]
  const periodos = []
  for (let y = 2020; y <= 2022; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2022 && m > 5) break // ano parcial
      periodos.push(`${y}-${String(m).padStart(2, '0')}`)
    }
  }
  return {
    version: '2026-10-05',
    periodos,
    municipios,
    regionais,
    mesos: ['Norte', 'Sul'],
    cadeias: [
      { nome: 'Grãos', cor: '#111111', descricao: 'Cereais e feijão' },
      { nome: 'Sojicultura', cor: '#222222', descricao: 'Soja' },
      { nome: 'Silvicultura', cor: '#333333', descricao: 'Produção florestal' },
      { nome: 'Avicultura', cor: '#444444', descricao: 'Aves e ovos' },
    ],
    subclasses: [
      { cod: '0111301', descricao: 'Cultivo de arroz', cadeia: 0 },
      { cod: '0111302', descricao: 'Cultivo de milho', cadeia: 0 },
      { cod: '0115600', descricao: 'Cultivo de soja', cadeia: 1 },
      { cod: '0210101', descricao: 'Cultivo de eucalipto', cadeia: 2 },
      { cod: '0230600', descricao: 'Atividades de apoio à produção florestal', cadeia: 2 },
      { cod: '0155501', descricao: 'Criação de frangos para corte', cadeia: 3 },
      { cod: '0155505', descricao: 'Produção de ovos', cadeia: 3 },
    ],
    sexo: ['Masculino', 'Feminino', 'Não informado'],
    faixa: ['Menor de 18', '18 a 24 anos', '25 a 29 anos', '30 a 39 anos', '40 a 49 anos', '50 a 64 anos', '65 anos ou mais', 'Não informado'],
    escolaridade: ['Fundamental Completo', 'Médio Completo', 'Superior Completo', 'Não informado'],
    porte: ['De 1 a 4', 'De 5 a 9', '1000 ou mais', 'Não informado'],
    sal_edges: SAL_EDGES,
  }
}

// PRNG determinístico (mulberry32)
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COLS = ['mun', 'sub', 'per', 'mov', 'sexo', 'faixa', 'esc', 'porte', 'sbin', 'n', 'sal', 'idade']

// Gera linhas e as separa em partições por regional (JSON colunar do §4).
export function makePartitions(dims, nRows = 3000, seed = 42) {
  const r = rng(seed)
  const pick = (k) => Math.floor(r() * k)
  const nMunComDados = dims.municipios.length - 1 // o último fica sem movimentação
  const parts = Object.fromEntries(dims.regionais.map((g) => [g.file, Object.fromEntries([['n_rows', 0], ...COLS.map((c) => [c, []])])]))
  for (let i = 0; i < nRows; i++) {
    // concentra linhas em poucos grupos para gerar amostras pequenas (n_sal < 5)
    const mun = r() < 0.08 ? 3 : pick(nMunComDados)
    const sub = r() < 0.05 ? 6 : pick(dims.subclasses.length - 1)
    const per = pick(dims.periodos.length)
    const mov = r() < 0.55 ? 1 : -1
    const sexo = r() < 0.05 ? 2 : pick(2)
    const faixa = r() < 0.07 ? 7 : pick(7)
    const esc = pick(dims.escolaridade.length)
    const porte = pick(dims.porte.length)
    const n = r() < 0.08 ? -1 : 1 + pick(3) // pesos negativos (ajuste EXC)
    let sbin = 0
    let sal = 0
    if (mov === 1 && r() < 0.8) {
      sbin = r() < 0.05 ? 26 : 1 + pick(12)
      const lo = SAL_EDGES[sbin - 1]
      sal = Math.round(n * (lo + r() * 90) * 100) / 100
    }
    const idade = mov === 1 && faixa !== 7 ? n * (16 + pick(50)) : 0
    const row = { mun, sub, per, mov, sexo, faixa, esc, porte, sbin, n, sal, idade }
    const file = dims.regionais.find((g) => g.nome === dims.municipios[mun].reg).file
    const p = parts[file]
    p.n_rows++
    for (const c of COLS) p[c].push(row[c])
  }
  return parts // { file: partição }
}
