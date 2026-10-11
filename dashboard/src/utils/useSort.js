import { useCallback, useState } from 'react'

// Estado de UI que sobrevive à remontagem da aba: o App troca a aba pelo
// Spinner a cada novo recorte, então busca, ordenação e métrica do mapa
// ficam num store do módulo, por chave (vale enquanto a página estiver aberta).
const store = new Map()
export function useStickyState(key, initial) {
  const [value, setValue] = useState(() => (store.has(key) ? store.get(key) : initial))
  const set = useCallback(
    (next) =>
      setValue((cur) => {
        const v = typeof next === 'function' ? next(cur) : next
        store.set(key, v)
        return v
      }),
    [key],
  )
  return [value, set]
}

// Ordenação local de tabela: clicar na mesma coluna inverte a direção.
// `key` identifica a tabela no store (ordenação preservada entre recortes).
export function useSort(initialCol, initialDir, key) {
  const [state, setState] = useStickyState(`sort:${key}`, { col: initialCol, dir: initialDir })
  const onSort = (col) =>
    setState((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }))
  return { sortCol: state.col, sortDir: state.dir, onSort }
}
