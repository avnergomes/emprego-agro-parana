// Utilitarios para os cubos granulares particionados (regiao / cadeia).
//
// Os bundles em public/data/granular/ usam um formato compacto colunar
// (dicionarios locais muns/periodos/cadeias/values + linhas de indices).
// Aqui ficam as duas funcoes puras que o App usa:
//   - decodeBundle: expande o compacto para os shapes EXATOS que os
//     componentes ja consomem (mesmos campos de granular_cube.json e das
//     dimensoes granulares);
//   - resolvePartition: dado os filtros ativos e o index.json, devolve a
//     lista de arquivos (superset-safe) a baixar.

// Mapa chave da dimensao -> nome do campo no registro decodificado.
const DIM_FIELDS = {
  bySexo: 'sexo',
  byFaixa: 'faixa',
  byEscolaridade: 'escolaridade',
  byPorte: 'porte',
}

// Dimensoes que carregam salario_medio (ultima coluna da linha).
const DIM_HAS_SAL = {
  byEscolaridade: true,
}

// Expande um bundle compacto para { cube, dims }.
//   cube -> [{ mun, periodo, cadeia, admissoes, demissoes, salario_medio, saldo }]
//           (saldo recalculado = admissoes - demissoes, igual a fonte)
//   dims -> { bySexo, byFaixa, byEscolaridade, byPorte } ou null quando o
//           bundle nao traz dimensoes (ex.: cube_all.json).
export function decodeBundle(bundle) {
  if (!bundle) return { cube: [], dims: null }

  const muns = bundle.muns || []
  const periodos = bundle.periodos || []
  const cadeias = bundle.cadeias || []

  const cube = (bundle.cube || []).map((r) => {
    const admissoes = r[3]
    const demissoes = r[4]
    return {
      mun: muns[r[0]],
      periodo: periodos[r[1]],
      cadeia: cadeias[r[2]],
      admissoes,
      demissoes,
      salario_medio: r[5],
      saldo: admissoes - demissoes,
    }
  })

  let dims = null
  for (const key of Object.keys(DIM_FIELDS)) {
    const d = bundle[key]
    if (!d) continue
    const field = DIM_FIELDS[key]
    const hasSal = !!DIM_HAS_SAL[key]
    const values = d.values || []
    const rows = (d.rows || []).map((r) => {
      const rec = {
        mun: muns[r[0]],
        periodo: periodos[r[1]],
        cadeia: cadeias[r[2]],
        [field]: values[r[3]],
        admissoes: r[4],
        demissoes: r[5],
      }
      if (hasSal) rec.salario_medio = r[6]
      return rec
    })
    if (!dims) dims = {}
    dims[key] = rows
  }

  return { cube, dims }
}

// Resolve a lista de arquivos de bundle necessarios para os filtros ativos.
// Regra de prioridade superset-safe (cada bundle contem MAIS do que o filtro
// client-side seleciona, nunca menos):
//   1. municipio OU regional -> 1 bundle de regiao (tem todas as cadeias e
//      periodos daquela regional);
//   2. mesorregiao -> bundles das regionais membros (disjuntos por municipio);
//   3. cadeia -> 1 bundle de cadeia;
//   4. periodo -> cube estadual (dimensoes nao sao usadas nesse caminho);
//   5. so sexo/faixa/escolaridade -> [] (esses filtros sao highlight-only,
//      nao filtram dados granulares; zero download).
// Retorna caminhos relativos a public/data/granular/.
export function resolvePartition(
  { munFilter, regIdrFilter, mesoFilter, cadeiaFilter, periodoFilter },
  index,
) {
  if (!index) return []

  // 1) municipio -> bundle da sua regional
  if (munFilter) {
    const slug = index.mun2reg && index.mun2reg[munFilter]
    const reg = slug && index.regioes && index.regioes[slug]
    return reg ? [reg.file] : []
  }

  // 1) regional (o filtro chega como NOME da RegIdr) -> bundle da regional
  if (regIdrFilter) {
    const slug = index.regByName && index.regByName[regIdrFilter]
    const reg = slug && index.regioes && index.regioes[slug]
    return reg ? [reg.file] : []
  }

  // 2) mesorregiao -> bundles das regionais membros
  if (mesoFilter) {
    const slugs = (index.mesos && index.mesos[mesoFilter]) || []
    return slugs
      .map((s) => index.regioes && index.regioes[s] && index.regioes[s].file)
      .filter(Boolean)
  }

  // 3) cadeia -> bundle da cadeia
  if (cadeiaFilter) {
    const cad = index.cadeias && index.cadeias[cadeiaFilter]
    return cad ? [cad.file] : []
  }

  // 4) periodo -> cubo estadual
  if (periodoFilter) {
    return index.cubeAll && index.cubeAll.file ? [index.cubeAll.file] : []
  }

  // 5) so highlight-only -> nada a baixar
  return []
}
