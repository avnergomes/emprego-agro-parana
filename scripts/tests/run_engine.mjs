// Roda o motor JS sobre casos de filtro, carregando do disco SÓ as partições
// que o navegador baixaria (requiredPartitions; sem filtro -> agregado.json).
// Uso: node scripts/tests/run_engine.mjs <cases.json> <saida.json> [dir_v2]
// cases.json: [{"id": "...", "filters": {...}}, ...] ou {"id": {...filtros}}.
// Saída: {id: saídas do §6} (o campo metadata do agregado.json é removido).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aggregate, decodePartitions, isEmptyFilters, requiredPartitions } from '../../dashboard/src/engine/index.js'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const [casesPath, outPath, dirArg] = process.argv.slice(2)
if (!casesPath || !outPath) {
  console.error('uso: node scripts/tests/run_engine.mjs <cases.json> <saida.json> [dir_v2]')
  process.exit(2)
}
const dir = dirArg || fileURLToPath(new URL('../../dashboard/public/data/v2/', import.meta.url))
const raw = readJson(casesPath)
const cases = Array.isArray(raw) ? raw.map((c) => [String(c.id), c.filters || {}]) : Object.entries(raw)

const t0 = performance.now()
const dims = readJson(join(dir, 'dims.json'))
const fileCache = new Map() // cada arquivo lido uma vez, como o cache do loader
const getPart = (f) => {
  if (!fileCache.has(f)) fileCache.set(f, readJson(join(dir, 'cubo', f)))
  return fileCache.get(f)
}
const results = {}
let tAgg = 0
for (const [id, filters] of cases) {
  if (isEmptyFilters(filters)) {
    const { metadata, ...saidas } = readJson(join(dir, 'agregado.json'))
    results[id] = saidas
    continue
  }
  const cube = decodePartitions(dims, requiredPartitions(dims, filters).map(getPart))
  const ta = performance.now()
  results[id] = aggregate(cube, dims, filters)
  tAgg += performance.now() - ta
}
writeFileSync(outPath, JSON.stringify(results), 'utf8')
console.log(`casos=${cases.length} total=${(performance.now() - t0).toFixed(0)}ms aggregate=${tAgg.toFixed(0)}ms -> ${outPath}`)
