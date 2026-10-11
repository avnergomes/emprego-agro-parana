// Testa scripts/build_agregado.mjs e scripts/tests/run_engine.mjs sobre um
// diretório v2 sintético temporário (mesmo layout de dashboard/public/data/v2).
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aggregate, decodePartitions } from '../index.js'
import { makeDims, makePartitions } from './fixture.mjs'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

test('build_agregado + run_engine no layout v2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'v2-'))
  try {
    const dims = makeDims()
    const parts = makePartitions(dims, 3000, 11)
    mkdirSync(join(dir, 'cubo'))
    writeFileSync(join(dir, 'dims.json'), JSON.stringify(dims), 'utf8')
    for (const [f, p] of Object.entries(parts)) writeFileSync(join(dir, 'cubo', f), JSON.stringify(p), 'utf8')
    const cube = decodePartitions(dims, dims.regionais.map((r) => parts[r.file]))

    execFileSync(process.execPath, [join(ROOT, 'scripts', 'build_agregado.mjs'), dir])
    const { metadata, ...agregado } = readJson(join(dir, 'agregado.json'))
    assert.deepStrictEqual(agregado, JSON.parse(JSON.stringify(aggregate(cube, dims, {}))))
    assert.equal(metadata.atualizacao, '2026-10-05')
    assert.equal(metadata.periodo_final, '2022-05')
    assert.equal(metadata.movimentacoes, agregado.kpis.acumulado.admissoes + agregado.kpis.acumulado.demissoes)
    assert.equal(metadata.total_municipios_com_dados, 6)

    const casos = [{ id: 'vazio', filters: {} }, { id: 'abatia', filters: { mun: '410010', cadeia: 'Grãos' } }]
    writeFileSync(join(dir, 'cases.json'), JSON.stringify(casos), 'utf8')
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'tests', 'run_engine.mjs'), join(dir, 'cases.json'), join(dir, 'out.json'), dir])
    const out = readJson(join(dir, 'out.json'))
    assert.deepStrictEqual(out.vazio, agregado)
    // só a partição de Cornélio Procópio foi carregada: byMunicipio fica na regional
    assert.deepEqual(new Set(out.abatia.byMunicipio.map((m) => m.reg)), new Set(['Cornélio Procópio']))
    assert.equal(out.abatia.kpis.acumulado.admissoes, aggregate(cube, dims, casos[1].filters).kpis.acumulado.admissoes)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
