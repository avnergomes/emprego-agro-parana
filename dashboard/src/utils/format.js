// Formatadores compartilhados. Valores null (ex.: salário com n_sal < 5,
// suprimido pelo motor por LGPD) viram "—"; quem exibe deve pôr o title
// SAL_NULL_TITLE no elemento.
export const SAL_NULL_TITLE = 'amostra insuficiente (menos de 5 admissões)'

export const formatNumber = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))

export const formatCurrency = (n) =>
  n == null ? '—' : `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const formatPercent = (n) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)

export const formatSigned = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR')}`)

// title para células de salário: só quando o valor foi suprimido
export const salTitle = (n) => (n == null ? SAL_NULL_TITLE : undefined)

// Ordena por coluna; null/undefined sempre por último (independe da direção).
export function sortRows(rows, col, dir) {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = a[col]
    const y = b[col]
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    if (typeof x === 'string') return sign * x.localeCompare(y, 'pt-BR')
    return sign * (x - y)
  })
}

// Destaque de cross-filter: com filtro ativo na dimensão do gráfico, o item
// selecionado mantém a cor (com contorno) e os demais ficam em cinza.
export const NEUTRAL = '#cbd5e1'
export const hlFill = (filterValue, value, base) => (!filterValue || filterValue === value ? base : NEUTRAL)
export const hlStroke = (filterValue, value) => (filterValue && filterValue === value ? '#14110c' : 'none')

// Campo do item clicado num gráfico Recharts (Bar/Pie entregam o dado em
// `payload` e, em algumas versões, também espalhado no próprio objeto).
export const clicked = (d, key) => d?.payload?.[key] ?? d?.[key]

// Top-N que sempre inclui o item selecionado (ao fim, se estiver fora do corte),
// para o destaque do cross-filter não sumir do gráfico.
export function topWithSel(rows, n, key, sel) {
  const top = rows.slice(0, n)
  if (sel && !top.some((r) => r[key] === sel)) {
    const s = rows.find((r) => r[key] === sel)
    if (s) top.push(s)
  }
  return top
}

// Valor do filtro só se existir nas linhas do gráfico; senão null (hlFill mantém
// as cores em vez de acinzentar tudo quando o selecionado não tem dados no recorte).
export const selIn = (rows, key, sel) => (sel && rows.some((r) => r[key] === sel) ? sel : null)
