// Testes do tratador de erros: payload grande e upload recusado.
// Antes destas correções, os dois casos devolviam "Erro interno do servidor".
import { login, post, get, ok, titulo, equipeDeTeste } from './api.mjs';

await login();
const BASE = 'http://localhost:3001/api';
const token = (await login()).token;

// ---------------------------------------------------------------------------
titulo('Payload acima do limite numa rota comum (limite de 10 MB)');
// /cards não é a rota do importador, então continua no limite apertado.
const r1 = await fetch(`${BASE}/cards`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ titulo: 'x'.repeat(11 * 1024 * 1024) }),
});
const d1 = await r1.json();
console.log('   → HTTP', r1.status, JSON.stringify(d1));
ok(r1.status === 413, 'devolve 413 em vez de 500');
ok(d1.codigo === 'payload_grande_demais', 'com código próprio, não "interno"');

// ---------------------------------------------------------------------------
titulo('JSON malformado');
const r2 = await fetch(`${BASE}/cards`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: '{"titulo": ',
});
const d2 = await r2.json();
console.log('   → HTTP', r2.status, JSON.stringify(d2));
ok(r2.status === 400, 'devolve 400 em vez de 500');
ok(d2.codigo === 'json_invalido', 'com mensagem que diz o que houve');

// ---------------------------------------------------------------------------
titulo('Anexo acima do limite de tamanho (o caso do vídeo)');
// Monta um quadro/coluna/card só para ter onde anexar.
const equipe_id = await equipeDeTeste();
const q = await post('/quadros', { equipe_id, nome: 'Quadro anexo ' + Date.now() });
const col = await post(`/quadros/${q.dados.id}/colunas`, { nome: 'A fazer' });
const card = await post('/cards', { coluna_id: col.dados.id, titulo: 'Card com anexo' });

// UPLOADS_MAX_MB=10 no .env local; mandamos 12 MB fingindo ser um vídeo.
const fake = new Uint8Array(12 * 1024 * 1024);
const form = new FormData();
form.append('arquivo', new Blob([fake], { type: 'video/mp4' }), 'video-demo.mp4');

const r3 = await fetch(`${BASE}/cards/${card.dados.id}/anexos`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const d3 = await r3.json();
console.log('   → HTTP', r3.status, JSON.stringify(d3));
ok(r3.status === 413, 'devolve 413 em vez de 500');
ok(d3.codigo === 'upload_recusado', 'com código próprio');
ok(/10 MB/.test(d3.erro), 'e a mensagem diz qual é o limite: ' + JSON.stringify(d3.erro));

// ---------------------------------------------------------------------------
titulo('Anexo de vídeo dentro do limite continua funcionando');
const menor = new Uint8Array(2 * 1024 * 1024);
const form2 = new FormData();
form2.append('arquivo', new Blob([menor], { type: 'video/mp4' }), 'video-pequeno.mp4');
const r4 = await fetch(`${BASE}/cards/${card.dados.id}/anexos`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form2,
});
const d4 = await r4.json();
console.log('   → HTTP', r4.status, (d4.nome_original || d4.erro));
ok(r4.status === 201, 'vídeo de 2 MB é aceito (o tipo nunca foi o problema)');
