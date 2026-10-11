// Gera dashboard/public/data/v2/agregado.json = aggregate(cubo inteiro, dims, {})
// + metadata (contrato §5/§6). Uso: node scripts/build_agregado.mjs [dir_v2]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aggregate, decodePartitions } from '../dashboard/src/engine/index.js'

const NOTA = 'Série por competência com ajustes (declarações fora do prazo e exclusões), metodologia do Novo CAGED/MTE.'
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

function loadAll(dir) {
  const dims = readJson(join(dir, 'dims.json'))
  // ordem de dims.regionais: determinística e igual à do navegador com todas as regionais
  const parts = dims.regionais.map((r) => readJson(join(dir, 'cubo', r.file)))
  const soltos = readdirSync(join(dir, 'cubo')).filter((f) => f.endsWith('.json') && !dims.regionais.some((r) => r.file === f))
  if (soltos.length) throw new Error(`arquivos de cubo fora de dims.regionais: ${soltos.join(', ')}`)
  return { dims, cube: decodePartitions(dims, parts) }
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const dir = process.argv[2] || join(root, 'dashboard', 'public', 'data', 'v2')
  const t0 = performance.now()
  const { dims, cube } = loadAll(dir)
  const t1 = performance.now()
  const out = aggregate(cube, dims, {})
  const t2 = performance.now()
  const metadata = {
    atualizacao: dims.version,
    periodo_inicial: dims.periodos[0],
    periodo_final: dims.periodos[dims.periodos.length - 1],
    movimentacoes: out.kpis.acumulado.admissoes + out.kpis.acumulado.demissoes,
    total_municipios_com_dados: out.byMunicipio.length,
    total_cadeias: out.byCadeia.length,
    total_subclasses: out.byCnae.length,
    nota_metodologica: NOTA,
  }
  writeFileSync(join(dir, 'agregado.json'), JSON.stringify({ metadata, ...out }), 'utf8')
  console.log(`linhas=${cube.n_rows} carga=${(t1 - t0).toFixed(0)}ms aggregate=${(t2 - t1).toFixed(1)}ms -> ${join(dir, 'agregado.json')}`)
  console.log(JSON.stringify(metadata))
}

main()
