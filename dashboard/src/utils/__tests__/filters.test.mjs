// node --test "src/utils/__tests__/*.test.mjs"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeDims } from '../../engine/__tests__/fixture.mjs'
import { FILTER_KEYS, isEmptyFilters } from '../../engine/index.js'
import {
  EMPTY_FILTERS, setFilter, toggleFilter, activeFilters, hierarchyOptions, describeFilter,
} from '../filters.js'
import { sortRows, formatCurrency, salTitle, SAL_NULL_TITLE } from '../format.js'

const dims = makeDims()

test('EMPTY_FILTERS cobre FILTER_KEYS e é vazio para o motor', () => {
  assert.deepEqual(Object.keys(EMPTY_FILTERS), FILTER_KEYS)
  assert.ok(isEmptyFilters(EMPTY_FILTERS))
})

test('município preenche regional e meso; limpar município mantém a regional', () => {
  const f = setFilter(dims, EMPTY_FILTERS, 'mun', '410010')
  assert.equal(f.reg, 'Cornélio Procópio')
  assert.equal(f.meso, 'Norte')
  const g = toggleFilter(dims, f, 'mun', '410010')
  assert.equal(g.mun, '')
  assert.equal(g.reg, 'Cornélio Procópio')
})

test('trocar meso limpa reg e mun; trocar reg ajusta meso e limpa mun', () => {
  const f = setFilter(dims, EMPTY_FILTERS, 'mun', '412810')
  const g = setFilter(dims, f, 'meso', 'Norte')
  assert.deepEqual([g.meso, g.reg, g.mun], ['Norte', '', ''])
  const h = setFilter(dims, g, 'reg', 'União da Vitória')
  assert.deepEqual([h.meso, h.reg, h.mun], ['Sul', 'União da Vitória', ''])
})

test('ano e periodo são exclusivos; clique repetido alterna', () => {
  const f = toggleFilter(dims, EMPTY_FILTERS, 'periodo', '2021-03')
  const g = toggleFilter(dims, f, 'ano', 2021) // yearly.ano chega como number
  assert.deepEqual([g.ano, g.periodo], ['2021', ''])
  assert.equal(toggleFilter(dims, g, 'ano', 2021).ano, '')
  assert.equal(toggleFilter(dims, g, 'periodo', '2020-01').ano, '')
})

test('cadeia incompatível limpa cnae; cnae ajusta a cadeia filtrada', () => {
  const f = setFilter(dims, { ...EMPTY_FILTERS, cadeia: 'Grãos' }, 'cnae', '0115600')
  assert.deepEqual([f.cadeia, f.cnae], ['Sojicultura', '0115600'])
  const g = setFilter(dims, f, 'cadeia', 'Grãos')
  assert.deepEqual([g.cadeia, g.cnae], ['Grãos', ''])
  const h = setFilter(dims, f, 'cadeia', 'Sojicultura')
  assert.equal(h.cnae, '0115600')
})

test('filtro desconhecido falha; estado de entrada não é mutado', () => {
  assert.throws(() => setFilter(dims, EMPTY_FILTERS, 'uf', '41'))
  const f = { ...EMPTY_FILTERS }
  setFilter(dims, f, 'sexo', 'Feminino')
  assert.equal(f.sexo, '')
})

test('activeFilters lista todos os filtros (inclusive regionais e cnae) com rótulos legíveis', () => {
  let f = setFilter(dims, EMPTY_FILTERS, 'mun', '410010')
  f = setFilter(dims, f, 'cnae', '0210101')
  f = setFilter(dims, f, 'porte', 'De 1 a 4')
  const a = activeFilters(dims, f)
  assert.deepEqual(a.map((x) => x.key), ['meso', 'reg', 'mun', 'cnae', 'porte'])
  assert.equal(a[2].value, 'Abatiá')
  assert.equal(a[3].value, '0210101 Cultivo de eucalipto')
  assert.equal(describeFilter(dims, 'mun', '999999'), '999999')
})

test('hierarchyOptions vem de dims e respeita meso/reg, ordenado com acentos', () => {
  const all = hierarchyOptions(dims, EMPTY_FILTERS)
  assert.equal(all.muns.length, dims.municipios.length)
  assert.equal(all.muns[0].nome, 'Abatiá')
  const norte = hierarchyOptions(dims, { ...EMPTY_FILTERS, meso: 'Norte' })
  assert.deepEqual(norte.regs.map((r) => r.nome), ['Cornélio Procópio', 'Londrina'])
  assert.equal(norte.muns.length, 4)
  const reg = hierarchyOptions(dims, setFilter(dims, EMPTY_FILTERS, 'reg', 'União da Vitória'))
  assert.deepEqual(reg.muns.map((m) => m.nome), ['Nova Laranjeiras', 'São Mateus do Sul', 'União da Vitória'])
})

test('sortRows: null por último nas duas direções; strings com pt-BR', () => {
  const rows = [{ v: 2 }, { v: null }, { v: 5 }, { v: 1 }]
  assert.deepEqual(sortRows(rows, 'v', 'desc').map((r) => r.v), [5, 2, 1, null])
  assert.deepEqual(sortRows(rows, 'v', 'asc').map((r) => r.v), [1, 2, 5, null])
  const s = [{ n: 'Ébano' }, { n: 'Abatiá' }, { n: 'Zé' }]
  assert.deepEqual(sortRows(s, 'n', 'asc').map((r) => r.n), ['Abatiá', 'Ébano', 'Zé'])
})

test('salário null vira "—" com title de amostra insuficiente', () => {
  assert.equal(formatCurrency(null), '—')
  assert.equal(salTitle(null), SAL_NULL_TITLE)
  assert.equal(salTitle(1500), undefined)
  assert.match(formatCurrency(1234.5), /^R\$ 1\.234,50$/)
})
