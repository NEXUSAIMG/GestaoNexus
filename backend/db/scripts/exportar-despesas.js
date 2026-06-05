/**
 * Script CLI — Exportar despesas para reclassificação
 *
 * SÓ LEITURA. Não altera nada no banco. Gera um arquivo JSON com todas as
 * contas a pagar (descrição, fornecedor, valor, categoria atual, recorrência)
 * + a lista de categorias existentes. Esse JSON é feito pra ser enviado ao
 * Claude, que devolve uma proposta de reclassificação revisável.
 *
 * Uso:
 *   npm run exportar-despesas
 *
 * Saída:
 *   ./despesas-export.json  (na pasta backend, de onde o npm roda)
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { query, closePool } from '../../src/config/database.js';

function iso(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  try { return new Date(v).toISOString().slice(0, 10); } catch { return null; }
}

async function rodar() {
  console.log('\n📦 Exportando despesas para reclassificação...\n');

  const { rows: categorias } = await query(`
    SELECT id, nome, cor, descricao, ativo
      FROM categorias_despesa
     ORDER BY ativo DESC, ordem, nome
  `);

  const { rows: contas } = await query(`
    SELECT cp.id,
           cp.descricao,
           cp.fornecedor_nome,
           cp.valor,
           cp.valor_pago,
           cp.status,
           cp.data_vencimento,
           cp.data_pagamento,
           cp.categoria_id,
           c.nome AS categoria_nome,
           c.cor  AS categoria_cor,
           (cp.grupo_recorrencia_id IS NOT NULL) AS recorrente,
           cp.recorrencia_tipo
      FROM contas_pagar cp
 LEFT JOIN categorias_despesa c ON c.id = cp.categoria_id
     WHERE cp.status <> 'cancelada'
  ORDER BY c.nome NULLS LAST, cp.descricao
  `);

  const despesas = contas.map((r) => ({
    id: r.id,
    descricao: r.descricao,
    fornecedor: r.fornecedor_nome || null,
    valor: Number(r.valor || 0),
    valor_pago: r.valor_pago != null ? Number(r.valor_pago) : null,
    status: r.status,
    vencimento: iso(r.data_vencimento),
    pagamento: iso(r.data_pagamento),
    categoria_atual_id: r.categoria_id,
    categoria_atual: r.categoria_nome || 'Sem categoria',
    recorrente: !!r.recorrente,
    recorrencia_tipo: r.recorrencia_tipo || null,
  }));

  const saida = {
    exportado_em: new Date().toISOString(),
    total_despesas: despesas.length,
    categorias: categorias.map((c) => ({
      id: c.id, nome: c.nome, cor: c.cor, descricao: c.descricao, ativo: c.ativo,
    })),
    despesas,
  };

  const caminho = resolve(process.cwd(), 'despesas-export.json');
  writeFileSync(caminho, JSON.stringify(saida, null, 2), 'utf8');

  // Resumo no terminal pra conferência rápida.
  const porCat = {};
  for (const d of despesas) {
    porCat[d.categoria_atual] = (porCat[d.categoria_atual] || 0) + 1;
  }
  console.log(`✅ ${despesas.length} despesa(s) e ${categorias.length} categoria(s) exportadas.`);
  console.log(`📄 Arquivo: ${caminho}\n`);
  console.log('Distribuição atual por categoria:');
  for (const [nome, qtd] of Object.entries(porCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  • ${nome}: ${qtd}`);
  }
  console.log('\nAgora é só enviar esse arquivo JSON no chat. 🙂\n');
}

rodar()
  .catch((err) => {
    console.error('\n❌ Erro:', err.message || err);
    process.exitCode = 1;
  })
  .finally(closePool);
