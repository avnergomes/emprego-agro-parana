// Testes do loader com fetch falso: caminhos, cache de Promises e retry após erro.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createLoader } from '../loader.js'
import { makeDims, makePartitions } from './fixture.mjs'

const dims = makeDims()
const parts = makePartitions(dims, 200, 1)

function fakeFetch(falhas = new Set()) {
  const chamadas = []
  const fn = async (url) => {
    chamadas.push(url)
    const nome = url.replace('/base/data/v2/', '')
    if (falhas.has(nome)) {
      falhas.delete(nome) // falha só na primeira vez
      return { ok: false, status: 503, json: async () => null }
    }
    const body = nome === 'dims.json' ? dims : nome === 'agregado.json' ? { kpis: {} } : parts[nome.replace('cubo/', '')]
    return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => null }
  }
  return { fn, chamadas }
}

test('loader: caminhos do contrato e cache por arquivo', async () => {
  const { fn, chamadas } = fakeFetch()
  const loader = createLoader('/base/', fn)
  const [d1, d2] = await Promise.all([loader.loadDims(), loader.loadDims()])
  assert.equal(d1, d2)
  await loader.loadAgregado()
  const cube = await loader.loadCube(['londrina.json', 'cornelio-procopio.json'])
  assert.equal(cube.n_rows, parts['londrina.json'].n_rows + parts['cornelio-procopio.json'].n_rows)
  assert.equal(await loader.loadCube(['cornelio-procopio.json', 'londrina.json']), cube)
  await loader.loadCube(['londrina.json'])
  assert.deepEqual(chamadas, ['/base/data/v2/dims.json', '/base/data/v2/agregado.json', '/base/data/v2/cubo/londrina.json', '/base/data/v2/cubo/cornelio-procopio.json'])
})

test('loader: erro sai do cache e a nova tentativa baixa de novo', async () => {
  const { fn, chamadas } = fakeFetch(new Set(['cubo/londrina.json']))
  const loader = createLoader('/base/', fn)
  await assert.rejects(loader.loadCube(['londrina.json']), /HTTP 503/)
  const cube = await loader.loadCube(['londrina.json'])
  assert.equal(cube.n_rows, parts['londrina.json'].n_rows)
  assert.equal(chamadas.filter((u) => u.endsWith('londrina.json')).length, 2)
  await assert.rejects(loader.loadCube(['nao-existe.json']), /HTTP 404/)
})
