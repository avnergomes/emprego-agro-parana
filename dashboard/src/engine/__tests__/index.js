// Permite `node --test dashboard/src/engine/__tests__/` (o Node 24 resolve o
// diretório como módulo e carrega este index); cada import registra seus testes.
import './engine.test.mjs'
import './loader.test.mjs'
import './scripts.test.mjs'
