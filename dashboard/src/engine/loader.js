// Carga dos dados v2 com cache (contrato §6.1). O motor (index.js) é puro;
// aqui fica o fetch. Cada arquivo é baixado uma vez (cache de Promises);
// em erro a entrada sai do cache para permitir nova tentativa. `no-cache`
// revalida no servidor, para dims/agregado/cubo não virem de deploys diferentes
// (o decode ainda confere versão e índices, ver decodePartitions).
import { decodePartitions } from './index.js'

export function createLoader(baseUrl, fetchFn = fetch) {
  const root = `${baseUrl}data/v2/`
  const cache = new Map()
  let lastCube = { key: null, promise: null }

  function getJson(path) {
    const url = root + path
    if (!cache.has(url)) {
      const p = fetchFn(url, { cache: 'no-cache' })
        .then((res) => {
          if (!res.ok) throw new Error(`falha ao carregar ${url}: HTTP ${res.status}`)
          return res.json()
        })
        .catch((err) => {
          cache.delete(url)
          throw err
        })
      cache.set(url, p)
    }
    return cache.get(url)
  }

  const loadDims = () => getJson('dims.json')
  const loadAgregado = () => getJson('agregado.json')

  // Cada partição fica no cache já decodificada (TypedArrays; o JSON parseado
  // é descartado, ~2,5x maior). Guarda também o último cubo concatenado.
  const partCache = new Map()
  function getPart(f) {
    if (!partCache.has(f)) {
      const p = Promise.all([loadDims(), getJson(`cubo/${f}`)])
        .then(([dims, json]) => {
          cache.delete(root + `cubo/${f}`)
          return decodePartitions(dims, [json])
        })
        .catch((err) => {
          partCache.delete(f)
          throw err
        })
      partCache.set(f, p)
    }
    return partCache.get(f)
  }

  function loadCube(files) {
    const key = [...files].sort().join('|')
    if (lastCube.key !== key) {
      const promise = Promise.all([loadDims(), ...files.map(getPart)])
        .then(([dims, ...parts]) => (parts.length === 1 ? parts[0] : decodePartitions(dims, parts)))
      lastCube = { key, promise }
      promise.catch(() => {
        if (lastCube.promise === promise) lastCube = { key: null, promise: null }
      })
    }
    return lastCube.promise
  }

  return { loadDims, loadAgregado, loadCube }
}
