// Recorte atual = saída do motor para os filtros (contrato §6/§6.1).
// Sem filtro: agregado.json (já é aggregate() do cubo inteiro).
// Com filtro: loadCube(requiredPartitions) + aggregate.
// `loading` vem da comparação de chaves: enquanto o resultado guardado não é
// do recorte pedido, a UI não recebe `agg` (nunca exibe números do recorte anterior).
import { useEffect, useState } from 'react'
import { aggregate, isEmptyFilters, requiredPartitions } from '../engine/index.js'

export function useSlice(loader, boot, filters, attempt) {
  const key = `${JSON.stringify(filters)}#${attempt}`
  const [result, setResult] = useState({ key: null, agg: null, error: null })

  useEffect(() => {
    if (!boot) return undefined
    let alive = true
    const pending = isEmptyFilters(filters)
      ? Promise.resolve(boot.agregado)
      : loader.loadCube(requiredPartitions(boot.dims, filters)).then((cube) => aggregate(cube, boot.dims, filters))
    pending.then(
      (agg) => alive && setResult({ key, agg, error: null }),
      (err) => alive && setResult({ key, agg: null, error: err?.message || String(err) }),
    )
    return () => {
      alive = false
    }
  }, [loader, boot, filters, key])

  const ready = result.key === key
  return {
    loading: !ready,
    agg: ready ? result.agg : null,
    error: ready ? result.error : null,
  }
}
