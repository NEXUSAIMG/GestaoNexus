# Importador de cards — `importar-quadro.js`

Importa cards de um arquivo **CSV** (ou **XLSX**) para um quadro existente do
GestaoNexus (tabelas `quadros` / `colunas` / `cards`). Reutilizável para
qualquer backlog: é só apontar o arquivo e o nome do quadro.

## Uso rápido

```bash
# produção (banco no Railway) — recomendado
railway run --service Postgres node importar-quadro.js --file cards.csv --quadro "Atividades Estagiários"

# prévia, sem gravar nada
node importar-quadro.js --file cards.csv --quadro "Atividades Estagiários" --dry-run

# ajuda
node importar-quadro.js --help
```

> Rode a partir da **raiz do projeto** (onde estão os arquivos e o `backend/`
> com o pacote `pg`).

## Opções

| Opção | Descrição |
|---|---|
| `--file <arquivo>` | Arquivo `.csv` ou `.xlsx` com os cards. **Obrigatório.** |
| `--quadro <nome>` | Nome **exato** do quadro de destino. **Obrigatório.** |
| `--coluna <nome>` | Coluna de destino. Padrão: a coluna do tipo `backlog` ("A fazer"). |
| `--sheet <nome>` | Aba do `.xlsx`. Padrão: a primeira. |
| `--dry-run` | Só mostra a prévia; não grava. |
| `--help`, `-h` | Mostra a ajuda embutida. |

## Formato do arquivo

Cabeçalho na primeira linha. Os nomes das colunas são reconhecidos **sem
diferenciar acento nem maiúsculas**. Delimitador `,` ou `;` (detectado sozinho).

| Coluna aceita | Vira | Obrigatória |
|---|---|---|
| `Titulo` / `Título` / `Card` | título do card | ✅ |
| `Descricao` / `Descrição` | descrição | — |
| `Prioridade` | `0-3` **ou** `Urgente/Crítica`, `Alta`, `Média/Normal`, `Baixa` | — |
| `Estimativa_h` / `Estimativa (h)` / `Horas` | `estimativa_horas` | — |
| `Tipo` | etiqueta (Bug, Melhoria, Urgente, Roadmap, …) | — |
| `Etiquetas` | etiquetas extras, separadas por `;` ou `,` | — |
| `Categoria`, `Cliente` | entram na **descrição** se não houver coluna `Descricao` | — |

Exemplo de CSV mínimo:

```csv
Titulo,Prioridade,Tipo,Estimativa_h
Corrigir login,Alta,Bug,4
Melhorar dashboard,Média,Melhoria,6
```

## Como se comporta

- **Idempotente:** cards cujo título já existe no quadro (não arquivados) são
  pulados — pode rodar de novo sem duplicar.
- **Prioridade** vira inteiro `0-3` (Urgente=0, Alta=1, Média/Normal=2, Baixa=3).
- **Etiquetas** que não existirem no quadro são criadas (com cores da paleta do
  app) e vinculadas aos cards.
- Insere na coluna **backlog** por padrão (ou na `--coluna` indicada).
- Roda numa **transação**: se algo falhar, faz rollback (nada grava pela metade).

## Conexão com o banco

O script usa, nesta ordem: `DATABASE_PUBLIC_URL` → `DATABASE_URL` (do ambiente),
e por último a `DATABASE_URL` do `backend/.env`.

⚠️ **Importante para este projeto:**
- A **produção** é o Postgres do **Railway**. Use sempre
  `railway run --service Postgres node importar-quadro.js ...` — isso injeta a
  `DATABASE_PUBLIC_URL` correta (host `*.proxy.rlwy.net`).
- O `backend/.env` local aponta para um banco **DBaaS antigo/desatualizado** —
  não use ele para importar em produção.
- O certificado SSL do banco está expirado; o script conecta com
  `ssl.rejectUnauthorized=false` e remove `sslmode` da URL para funcionar.

## Ler `.xlsx`

Para `.xlsx` é preciso o pacote `xlsx` (`npm i xlsx`). Se não estiver instalado,
exporte a planilha como **CSV** e use `--file cards.csv` (funciona sem nada extra).

## Arquivos relacionados

- `importar-quadro.js` — este importador reutilizável.
- `teste-importador.js` — helper de teste: `create` / `contar` / `limpar` um
  quadro descartável ("ZZ Teste Importador (apagar)") para validar sem risco.
- `cards_gestaonexus.csv` — o backlog dos 27 cards (exemplo de formato).
- `importar_cards_gestaonexus.sql` / `importar-cards.js` — o import específico
  original (mesmos 27 cards embutidos).
