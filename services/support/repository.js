'use strict';

const sqlite3 = require('sqlite3');
const crypto = require('crypto');
const path = require('path');

function fail(status, message) { return Object.assign(new Error(message), { status }); }
function requestKey(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(value)) throw fail(400, 'Identificador da solicitação inválido.');
  return value;
}

class SupportRepository {
  constructor({ filename } = {}) {
    if (!filename || !path.isAbsolute(filename)) throw new Error('O banco de suporte exige um caminho absoluto explícito.');
    this.filename = filename;
    this.queue = Promise.resolve();
    this.initialization = null;
  }

  async ready() {
    if (!this.initialization) this.initialization = this.open();
    return this.initialization;
  }

  async open() {
    this.db = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.filename, err => err ? reject(err) : resolve(db));
    });
    try {
      this.db.configure('busyTimeout', 5000);
      await this.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
      await this.exec(`
        CREATE TABLE IF NOT EXISTS support_tickets (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, requester_id TEXT NOT NULL,
          create_key TEXT NOT NULL, ai_consent INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'bot' CHECK(status IN ('bot','waiting_human','human','resolved')),
          priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
          assigned_to TEXT, version INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          UNIQUE(tenant_id,requester_id,create_key)
        );
        CREATE TABLE IF NOT EXISTS support_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('user','assistant','human','system')),
          text TEXT NOT NULL, references_json TEXT NOT NULL DEFAULT '[]', mode TEXT,
          author_id TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS support_requests (
          ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
          request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(ticket_id,request_key)
        );
        CREATE INDEX IF NOT EXISTS support_requester_idx ON support_tickets(tenant_id,requester_id,updated_at);
        CREATE INDEX IF NOT EXISTS support_queue_idx ON support_tickets(status,priority,updated_at);
        CREATE INDEX IF NOT EXISTS support_messages_idx ON support_messages(ticket_id,id);
      `);
    } catch (error) {
      await new Promise(resolve => this.db.close(resolve));
      this.db = null;
      throw error;
    }
  }

  exec(sql) { return new Promise((resolve, reject) => this.db.exec(sql, err => err ? reject(err) : resolve())); }
  run(sql, params = []) { return new Promise((resolve, reject) => this.db.run(sql, params, function (err) { err ? reject(err) : resolve({ changes: this.changes, lastID: this.lastID }); })); }
  get(sql, params = []) { return new Promise((resolve, reject) => this.db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))); }
  all(sql, params = []) { return new Promise((resolve, reject) => this.db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))); }

  serialized(fn) {
    const work = this.queue.then(async () => { await this.ready(); return fn(); });
    this.queue = work.catch(() => {});
    return work;
  }

  transaction(fn) {
    return this.serialized(async () => {
      await this.exec('BEGIN IMMEDIATE');
      try { const result = await fn(); await this.exec('COMMIT'); return result; }
      catch (error) { await this.exec('ROLLBACK').catch(() => {}); throw error; }
    });
  }

  async find(id, owner) {
    const ticket = owner
      ? await this.get('SELECT * FROM support_tickets WHERE id=? AND tenant_id=? AND requester_id=?', [id, owner.tenantId, owner.actorId])
      : await this.get('SELECT * FROM support_tickets WHERE id=?', [id]);
    if (!ticket) throw fail(404, 'Atendimento não encontrado.');
    return ticket;
  }

  async snapshot(ticket) {
    const messages = await this.all('SELECT id,role,text,references_json,mode,created_at FROM support_messages WHERE ticket_id=? ORDER BY id', [ticket.id]);
    return {
      id: ticket.id, protocol: `PAT-${ticket.id.slice(0, 8).toUpperCase()}`,
      tenantId: ticket.tenant_id, status: ticket.status, priority: ticket.priority,
      assignedTo: ticket.assigned_to, version: ticket.version, aiConsent: Boolean(ticket.ai_consent),
      createdAt: ticket.created_at, updatedAt: ticket.updated_at,
      messages: messages.map(m => ({ id: m.id, role: m.role, text: m.text, references: JSON.parse(m.references_json), mode: m.mode, createdAt: m.created_at })),
    };
  }

  async append(id, role, text, { references = [], mode = null, authorId = null } = {}) {
    await this.run('INSERT INTO support_messages(ticket_id,role,text,references_json,mode,author_id,created_at) VALUES(?,?,?,?,?,?,?)', [id, role, text, JSON.stringify(references), mode, authorId, new Date().toISOString()]);
  }

  create(owner, key, aiConsent) {
    requestKey(key);
    return this.transaction(async () => {
      const existing = await this.get('SELECT * FROM support_tickets WHERE tenant_id=? AND requester_id=? AND create_key=?', [owner.tenantId, owner.actorId, key]);
      if (existing) return this.snapshot(existing);
      const count = await this.get("SELECT COUNT(*) AS n FROM support_tickets WHERE tenant_id=? AND requester_id=? AND status!='resolved'", [owner.tenantId, owner.actorId]);
      if (count.n >= 3) throw fail(409, 'Você já tem três atendimentos abertos. Continue em um dos protocolos existentes.');
      const recent = await this.get("SELECT COUNT(*) AS n FROM support_tickets WHERE tenant_id=? AND requester_id=? AND created_at>?", [owner.tenantId, owner.actorId, new Date(Date.now() - 86400000).toISOString()]);
      if (recent.n >= 10) throw fail(429, 'Limite diário de novos atendimentos atingido. Continue em um protocolo existente.');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await this.run('INSERT INTO support_tickets(id,tenant_id,requester_id,create_key,ai_consent,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', [id, owner.tenantId, owner.actorId, key, aiConsent ? 1 : 0, now, now]);
      await this.append(id, 'assistant', 'Olá! Sou o assistente virtual de suporte do Pátio CRM. Posso orientar sobre o sistema ou abrir um atendimento humano. Conte em qual tela precisa de ajuda. Não envie senhas, documentos, dados bancários ou dados de terceiros.', { mode: 'welcome' });
      return this.snapshot(await this.find(id, owner));
    });
  }

  read(owner, id) { return this.serialized(async () => this.snapshot(await this.find(id, owner))); }

  preflightMessage({ owner, id, requestId, version, text, actorId }) {
    requestKey(requestId);
    if (!Number.isSafeInteger(version) || version < 0) throw fail(400, 'Versão do atendimento inválida.');
    return this.serialized(async () => {
      const ticket = await this.find(id, owner);
      const replay = await this.get('SELECT fingerprint FROM support_requests WHERE ticket_id=? AND request_key=?', [id, requestId]);
      if (replay) {
        const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ operation: 'message', text, actorId })).digest('hex');
        if (replay.fingerprint !== fingerprint) throw fail(409, 'Esta solicitação já foi usada com outro conteúdo.');
        return this.snapshot(ticket);
      }
      if (ticket.version !== version || ticket.status === 'resolved') throw fail(409, 'O atendimento foi atualizado ou encerrado. Recarregue a conversa.');
      const count = await this.get('SELECT COUNT(*) AS n FROM support_messages WHERE ticket_id=?', [id]);
      const daily = await this.get("SELECT COUNT(*) AS n FROM support_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.tenant_id=? AND t.requester_id=? AND m.role='user' AND m.created_at>?", [ticket.tenant_id, ticket.requester_id, new Date(Date.now() - 86400000).toISOString()]);
      if (count.n >= 200 || daily.n >= 100) throw fail(429, 'Limite de mensagens atingido. Seu protocolo permanece disponível ao suporte.');
      return null;
    });
  }

  list(owner, { status, limit = 30 } = {}) {
    return this.serialized(async () => {
      const where = owner ? 'tenant_id=? AND requester_id=?' : "status IN ('waiting_human','human')";
      const params = owner ? [owner.tenantId, owner.actorId] : [];
      const rows = await this.all(`SELECT * FROM support_tickets WHERE ${where}${status ? ' AND status=?' : ''} ORDER BY CASE priority WHEN 'urgent' THEN 0 ELSE 1 END, updated_at DESC LIMIT ?`, [...params, ...(status ? [status] : []), Math.min(100, limit)]);
      return rows.map(row => ({ id: row.id, protocol: `PAT-${row.id.slice(0, 8).toUpperCase()}`, tenantId: row.tenant_id, status: row.status, priority: row.priority, assignedTo: row.assigned_to, version: row.version, updatedAt: row.updated_at }));
    });
  }

  change({ owner, id, requestId, version, operation, text = '', actorId, answer = null }) {
    requestKey(requestId);
    if (!Number.isSafeInteger(version) || version < 0) throw fail(400, 'Versão do atendimento inválida.');
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ operation, text, actorId })).digest('hex');
    return this.transaction(async () => {
      const ticket = await this.find(id, owner);
      const replay = await this.get('SELECT fingerprint FROM support_requests WHERE ticket_id=? AND request_key=?', [id, requestId]);
      if (replay) {
        if (replay.fingerprint !== fingerprint) throw fail(409, 'Esta solicitação já foi usada com outro conteúdo.');
        return this.snapshot(ticket);
      }
      if (ticket.version !== version) throw fail(409, 'O atendimento foi atualizado. Recarregue a conversa antes de continuar.');
      if (ticket.status === 'resolved') throw fail(409, 'Este atendimento foi encerrado. Abra um novo protocolo.');
      const count = await this.get('SELECT COUNT(*) AS n FROM support_messages WHERE ticket_id=?', [id]);
      if (operation === 'message' && count.n >= 200) throw fail(429, 'Este protocolo atingiu o limite de mensagens. Solicite atendimento humano ou abra outro protocolo.');
      if (operation === 'message') {
        const daily = await this.get("SELECT COUNT(*) AS n FROM support_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.tenant_id=? AND t.requester_id=? AND m.role='user' AND m.created_at>?", [ticket.tenant_id, ticket.requester_id, new Date(Date.now() - 86400000).toISOString()]);
        if (daily.n >= 100) throw fail(429, 'Limite diário de mensagens atingido. Seu protocolo permanece disponível ao suporte.');
        await this.append(id, 'user', text, { authorId: actorId });
        if (ticket.status === 'bot' && answer) {
          await this.append(id, 'assistant', answer.text, { references: answer.references, mode: answer.mode });
          if (answer.handoff) {
            ticket.status = 'waiting_human';
            ticket.priority = answer.priority;
            await this.append(id, 'system', 'Solicitação registrada na fila humana. Acompanhe a resposta neste protocolo. Nenhum prazo de atendimento foi confirmado.');
          }
        } else if (answer?.priority === 'urgent') { ticket.priority = 'urgent'; }
      } else if (operation === 'handoff') {
        if (ticket.status === 'bot') {
          ticket.status = 'waiting_human';
          await this.append(id, 'system', 'Atendimento humano solicitado. A equipe ainda não assumiu este protocolo.', { authorId: actorId });
        }
      } else if (operation === 'claim') {
        if (!['waiting_human', 'human'].includes(ticket.status)) throw fail(409, 'O atendimento não está na fila humana.');
        if (ticket.assigned_to && ticket.assigned_to !== actorId) throw fail(409, 'Outro atendente já assumiu este protocolo.');
        ticket.status = 'human'; ticket.assigned_to = actorId;
        await this.append(id, 'system', 'Um atendente humano assumiu seu protocolo.', { authorId: actorId });
      } else if (operation === 'reply') {
        if (ticket.status !== 'human' || ticket.assigned_to !== actorId) throw fail(409, 'Assuma este atendimento antes de responder.');
        await this.append(id, 'human', text, { authorId: actorId });
      } else if (operation === 'resolve') {
        if (!owner && ticket.assigned_to !== actorId) throw fail(409, 'Somente o atendente responsável pode encerrar este protocolo.');
        ticket.status = 'resolved';
        await this.append(id, 'system', owner ? 'Atendimento encerrado pelo solicitante.' : 'Atendimento encerrado pelo suporte.', { authorId: actorId });
      } else throw fail(400, 'Operação de suporte inválida.');
      await this.run('UPDATE support_tickets SET status=?,priority=?,assigned_to=?,version=version+1,updated_at=? WHERE id=?', [ticket.status, ticket.priority, ticket.assigned_to, new Date().toISOString(), id]);
      await this.run('INSERT INTO support_requests(ticket_id,request_key,fingerprint) VALUES(?,?,?)', [id, requestId, fingerprint]);
      return this.snapshot(await this.find(id, owner));
    });
  }

  async close() {
    await this.queue;
    if (this.initialization) await this.initialization.catch(() => {});
    if (this.db) await new Promise((resolve, reject) => this.db.close(error => error ? reject(error) : resolve()));
    this.db = null;
  }
}

module.exports = { SupportRepository, fail };
