import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehConversaComigo, textoDaMensagem } from '../src/whatsapp.js';

const eu = { id: '5511999998888:12@s.whatsapp.net', lid: '123456789:12@lid' };

test('aceita só mensagens minhas na conversa comigo', () => {
  assert.equal(ehConversaComigo({ fromMe: true, remoteJid: '5511999998888@s.whatsapp.net' }, eu), true);
  assert.equal(ehConversaComigo({ fromMe: true, remoteJid: '123456789@lid' }, eu), true);
  assert.equal(ehConversaComigo({ fromMe: true, remoteJid: 'x@lid', remoteJidAlt: '5511999998888@s.whatsapp.net' }, eu), true);
  // mensagem que eu mandei para outra pessoa
  assert.equal(ehConversaComigo({ fromMe: true, remoteJid: '5511777776666@s.whatsapp.net' }, eu), false);
  // mensagem que outra pessoa me mandou
  assert.equal(ehConversaComigo({ fromMe: false, remoteJid: '5511777776666@s.whatsapp.net' }, eu), false);
  // grupo
  assert.equal(ehConversaComigo({ fromMe: true, remoteJid: '1203630@g.us' }, eu), false);
});

test('extrai texto de mensagem simples, respondida e temporária', () => {
  assert.equal(textoDaMensagem({ conversation: 'uber 20' }), 'uber 20');
  assert.equal(textoDaMensagem({ extendedTextMessage: { text: 'ifood 30' } }), 'ifood 30');
  assert.equal(textoDaMensagem({ ephemeralMessage: { message: { conversation: 'mercado 50' } } }), 'mercado 50');
  assert.equal(textoDaMensagem({ imageMessage: {} }), null);
});
