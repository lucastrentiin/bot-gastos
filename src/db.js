// Banco de dados SQLite: um arquivo só (dados/gastos.db), fácil de copiar como backup.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function abrirBanco(arquivo = process.env.DB_PATH || './dados/gastos.db') {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new Database(arquivo);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS gastos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      data       TEXT NOT NULL,          -- AAAA-MM-DD
      valor      REAL NOT NULL,
      descricao  TEXT NOT NULL,
      categoria  TEXT NOT NULL,
      origem     TEXT NOT NULL,          -- palavra-chave | aprendido | ia | padrao | manual
      criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gastos_data ON gastos(data);

    -- O que o bot aprendeu: "descrição normalizada" -> categoria
    CREATE TABLE IF NOT EXISTS aprendizados (
      chave      TEXT PRIMARY KEY,
      categoria  TEXT NOT NULL
    );

    -- Limite mensal por categoria
    CREATE TABLE IF NOT EXISTS orcamentos (
      categoria  TEXT PRIMARY KEY,
      limite     REAL NOT NULL
    );

    -- Configurações soltas (renda mensal, último relatório enviado...)
    CREATE TABLE IF NOT EXISTS config (
      chave  TEXT PRIMARY KEY,
      valor  TEXT
    );
  `);
  // versão nova: hora do gasto (vem dos prints de notificação; ajuda a não duplicar)
  const colunas = db.prepare('PRAGMA table_info(gastos)').all().map((c) => c.name);
  if (!colunas.includes('hora')) db.exec('ALTER TABLE gastos ADD COLUMN hora TEXT');
  return criarRepositorio(db);
}

function criarRepositorio(db) {
  const q = {
    inserir: db.prepare(
      'INSERT INTO gastos (data, hora, valor, descricao, categoria, origem) VALUES (@data, @hora, @valor, @descricao, @categoria, @origem)',
    ),
    porId: db.prepare('SELECT * FROM gastos WHERE id = ?'),
    ultimo: db.prepare('SELECT * FROM gastos ORDER BY id DESC LIMIT 1'),
    ultimos: db.prepare('SELECT * FROM gastos ORDER BY id DESC LIMIT ?'),
    apagar: db.prepare('DELETE FROM gastos WHERE id = ?'),
    mudarCategoria: db.prepare("UPDATE gastos SET categoria = ?, origem = 'manual' WHERE id = ?"),
    doPeriodo: db.prepare('SELECT * FROM gastos WHERE data >= ? AND data <= ? ORDER BY data, id'),
    doMes: db.prepare("SELECT * FROM gastos WHERE substr(data, 1, 7) = ? ORDER BY data, id"),
    totalCategoriaMes: db.prepare(
      "SELECT COALESCE(SUM(valor), 0) AS total FROM gastos WHERE substr(data, 1, 7) = ? AND categoria = ?",
    ),
    buscar: db.prepare('SELECT * FROM gastos WHERE descricao LIKE ? ORDER BY data DESC, id DESC LIMIT 20'),
    aprendido: db.prepare('SELECT categoria FROM aprendizados WHERE chave = ?'),
    todosAprendidos: db.prepare('SELECT chave, categoria FROM aprendizados'),
    aprender: db.prepare(
      'INSERT INTO aprendizados (chave, categoria) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET categoria = excluded.categoria',
    ),
    orcamentos: db.prepare('SELECT categoria, limite FROM orcamentos ORDER BY categoria'),
    orcamento: db.prepare('SELECT limite FROM orcamentos WHERE categoria = ?'),
    definirOrcamento: db.prepare(
      'INSERT INTO orcamentos (categoria, limite) VALUES (?, ?) ON CONFLICT(categoria) DO UPDATE SET limite = excluded.limite',
    ),
    removerOrcamento: db.prepare('DELETE FROM orcamentos WHERE categoria = ?'),
    lerConfig: db.prepare('SELECT valor FROM config WHERE chave = ?'),
    gravarConfig: db.prepare(
      'INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
    ),
  };

  return {
    db,
    inserirGasto(g) {
      const info = q.inserir.run({ hora: null, ...g });
      return q.porId.get(info.lastInsertRowid);
    },
    gasto: (id) => q.porId.get(id),
    ultimoGasto: () => q.ultimo.get(),
    ultimosGastos: (n = 10) => q.ultimos.all(n),
    apagarGasto: (id) => q.apagar.run(id).changes > 0,
    mudarCategoria: (id, categoria) => q.mudarCategoria.run(categoria, id).changes > 0,
    gastosDoPeriodo: (de, ate) => q.doPeriodo.all(de, ate),
    gastosDoMes: (mes) => q.doMes.all(mes),
    totalCategoriaMes: (mes, categoria) => q.totalCategoriaMes.get(mes, categoria).total,
    buscar: (termo) => q.buscar.all(`%${termo}%`),
    aprendido: (chave) => q.aprendido.get(chave)?.categoria ?? null,
    todosAprendidos: () => q.todosAprendidos.all(),
    aprender: (chave, categoria) => q.aprender.run(chave, categoria),
    orcamentos: () => q.orcamentos.all(),
    orcamento: (categoria) => q.orcamento.get(categoria)?.limite ?? null,
    definirOrcamento: (categoria, limite) => q.definirOrcamento.run(categoria, limite),
    removerOrcamento: (categoria) => q.removerOrcamento.run(categoria).changes > 0,
    config: (chave) => q.lerConfig.get(chave)?.valor ?? null,
    gravarConfig: (chave, valor) => q.gravarConfig.run(chave, String(valor)),
  };
}
