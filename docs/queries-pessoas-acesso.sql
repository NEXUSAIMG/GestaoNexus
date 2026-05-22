-- =====================================================================
-- Consultas úteis para pessoas de acesso
-- =====================================================================
-- Para rodar: abra o Neon Console (ou DBeaver, pgAdmin, psql etc.) e
-- aponte pra DATABASE_URL definida em backend/.env.
--
-- IMPORTANTE: senhas ficam armazenadas como hash bcrypt na coluna
-- `senha_hash`. Não há como recuperar a senha original a partir do
-- hash — é matematicamente impossível por design. Pra dar acesso a
-- alguém que esqueceu a senha, o caminho é: admin reseta via UI ou
-- via SQL direto (script no final deste arquivo).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Encontrar o Nestor (busca por nome parcial, case-insensitive)
-- ---------------------------------------------------------------------
SELECT
  id,
  nome,
  email,
  administrador,
  ativo,
  ultimo_login_em,
  created_at
FROM pessoas_acesso
WHERE LOWER(nome) LIKE '%nestor%'
ORDER BY created_at;


-- ---------------------------------------------------------------------
-- 2. Listar TODAS as pessoas de acesso (panorama geral)
-- ---------------------------------------------------------------------
SELECT
  nome,
  email,
  CASE WHEN administrador THEN 'admin' ELSE 'comum' END AS papel,
  CASE WHEN ativo THEN 'ativo' ELSE 'inativo' END AS situacao,
  ultimo_login_em,
  created_at AS cadastrado_em
FROM pessoas_acesso
ORDER BY administrador DESC, nome;


-- ---------------------------------------------------------------------
-- 3. Ver as representações de uma pessoa (a quais sócios ela responde)
-- ---------------------------------------------------------------------
-- Substitua 'nestor' pelo trecho do nome que quiser
SELECT
  p.nome   AS pessoa,
  p.email  AS pessoa_email,
  s.nome   AS socio,
  r.papel,
  r.pode_ver_financeiro,
  r.pode_votar,
  r.pode_aprovar_atas,
  r.pode_aprovar_distribuicoes,
  r.data_inicio,
  r.data_fim,
  r.ativo
FROM pessoas_acesso p
JOIN representacoes r ON r.pessoa_acesso_id = p.id
JOIN socios s ON s.id = r.socio_id
WHERE LOWER(p.nome) LIKE '%nestor%'
ORDER BY r.ativo DESC, r.data_inicio;


-- ---------------------------------------------------------------------
-- 4. Pessoas que NUNCA logaram (útil pra investigar onboarding parado)
-- ---------------------------------------------------------------------
SELECT nome, email, created_at AS cadastrado_em
FROM pessoas_acesso
WHERE ultimo_login_em IS NULL
  AND ativo = TRUE
ORDER BY created_at;


-- =====================================================================
-- RESET DE SENHA via SQL (use só em último caso — prefira a UI)
-- =====================================================================
-- O caminho recomendado é fazer login como admin e usar:
--   Sidebar → Cadastros → Pessoas de acesso → ícone de chave 🔑
--
-- Se por algum motivo a UI estiver inacessível e você precisa resetar
-- via SQL direto, siga o passo abaixo. ATENÇÃO: você precisa gerar o
-- hash bcrypt da senha nova ANTES (não dá pra inserir senha em texto
-- puro).
--
-- Como gerar o hash (rode num terminal com Node.js do backend):
--
--   cd backend
--   node -e "import('./src/utils/password.js').then(m => m.hashSenha('SenhaTemporaria123!').then(h => console.log(h)))"
--
-- Vai imprimir algo como: $2b$10$abcDE.....
-- Copia esse valor e cola no UPDATE abaixo no lugar de COLE_O_HASH_AQUI.
-- =====================================================================

-- UPDATE pessoas_acesso
--    SET senha_hash = 'COLE_O_HASH_AQUI',
--        updated_at = NOW()
--  WHERE LOWER(email) = LOWER('nestor@exemplo.com.br');

-- Depois do reset, avise a pessoa pra logar com a senha temporária e
-- trocar imediatamente no perfil dela.


-- =====================================================================
-- DESATIVAR uma pessoa (sem apagar histórico)
-- =====================================================================
-- Mantém o cadastro mas impede login. Reversível: basta setar ativo = TRUE.

-- UPDATE pessoas_acesso
--    SET ativo = FALSE,
--        updated_at = NOW()
--  WHERE LOWER(email) = LOWER('email@exemplo.com.br');
