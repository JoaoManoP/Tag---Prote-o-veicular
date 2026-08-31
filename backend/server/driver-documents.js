'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { requireAuth } = require('./auth');
const { ROLES, requireRole } = require('./authorization');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);

function validDocument(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || buffer.length > 5 * 1024 * 1024)
    return false;
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (mimeType === 'image/png')
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8;
  return false;
}

function validExpiry(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && parsed > Date.now() - 24 * 60 * 60 * 1000;
}

function publicDocument(row) {
  if (!row) return null;
  const expired = Date.parse(`${row.cnh_expiry_date}T23:59:59Z`) < Date.now();
  return {
    id: row.id,
    status: expired && row.status === 'APPROVED' ? 'EXPIRED' : row.status,
    expiryDate: row.cnh_expiry_date,
    verifiedAt: row.cnh_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rejectionReason: row.status === 'REJECTED' ? row.rejection_reason : null
  };
}

function requireApprovedCnh(database, enabled) {
  return (req, res, next) => {
    if (!enabled) return next();
    const row = database
      .prepare('SELECT status,cnh_expiry_date FROM driver_documents WHERE user_id=?')
      .get(req.session?.userId);
    if (!row)
      return res.status(428).json({
        error: 'Plano indisponível — envie sua CNH para continuar.',
        code: 'CNH_REQUIRED'
      });
    if (row.status === 'PENDING')
      return res.status(428).json({ error: 'Documento em análise.', code: 'CNH_PENDING' });
    if (row.status !== 'APPROVED' || Date.parse(`${row.cnh_expiry_date}T23:59:59Z`) < Date.now())
      return res.status(428).json({
        error: 'Atualize sua CNH para continuar utilizando os recursos condicionados ao documento.',
        code: 'CNH_INVALID'
      });
    next();
  };
}

function createDriverDocumentsRouter({ database, requireCsrf, twoFactorGuard, storageDirectory }) {
  const router = express.Router();
  const privateDirectory = path.resolve(
    storageDirectory ||
      process.env.PRIVATE_DOCUMENTS_PATH ||
      path.join(__dirname, '..', '..', 'database', 'data', 'private-documents')
  );
  fs.mkdirSync(privateDirectory, { recursive: true });
  const admin = requireRole(database, ROLES.ADMIN);

  router.get('/cnh', requireAuth, (req, res) => {
    const row = database
      .prepare('SELECT * FROM driver_documents WHERE user_id=?')
      .get(req.session.userId);
    res.json({ document: publicDocument(row) });
  });

  router.post(
    '/cnh',
    requireAuth,
    requireCsrf,
    express.raw({ type: 'application/octet-stream', limit: '5mb' }),
    (req, res, next) => {
      try {
        const mimeType = String(req.get('x-document-type') || '').toLowerCase();
        const expiryDate = String(req.get('x-cnh-expiry') || '');
        if (!ALLOWED_MIME.has(mimeType) || !validDocument(req.body, mimeType))
          return res
            .status(400)
            .json({ error: 'Documento inválido. Envie PDF, PNG ou JPEG de até 5 MB.' });
        if (!validExpiry(expiryDate))
          return res.status(400).json({ error: 'Data de validade da CNH inválida ou vencida.' });
        const existing = database
          .prepare('SELECT id,document_storage_key FROM driver_documents WHERE user_id=?')
          .get(req.session.userId);
        const id = existing?.id || crypto.randomUUID();
        const extension =
          mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
        const storageKey = `${crypto.randomUUID()}.${extension}`;
        const target = path.join(privateDirectory, storageKey);
        fs.writeFileSync(target, req.body, { flag: 'wx', mode: 0o600 });
        const now = Date.now();
        database.transaction(() => {
          database
            .prepare(
              `INSERT INTO driver_documents (id,user_id,status,cnh_expiry_date,document_storage_key,mime_type,created_at,updated_at)
               VALUES (?,?,'PENDING',?,?,?,?,?)
               ON CONFLICT(user_id) DO UPDATE SET status='PENDING',cnh_expiry_date=excluded.cnh_expiry_date,
               cnh_verified_at=NULL,cnh_verified_by=NULL,document_storage_key=excluded.document_storage_key,
               mime_type=excluded.mime_type,rejection_reason=NULL,updated_at=excluded.updated_at`
            )
            .run(id, req.session.userId, expiryDate, storageKey, mimeType, now, now);
        })();
        if (existing?.document_storage_key) {
          const previous = path.join(
            privateDirectory,
            path.basename(existing.document_storage_key)
          );
          try {
            fs.unlinkSync(previous);
          } catch {}
        }
        res.status(201).json({
          document: publicDocument(
            database.prepare('SELECT * FROM driver_documents WHERE id=?').get(id)
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get('/admin/cnh', admin, (req, res) => {
    const rows = database
      .prepare(
        `SELECT d.*,u.name,u.email FROM driver_documents d JOIN users u ON u.id=d.user_id
         ORDER BY CASE d.status WHEN 'PENDING' THEN 0 ELSE 1 END,d.updated_at DESC LIMIT 200`
      )
      .all();
    res.json({
      documents: rows.map(row => ({
        ...publicDocument(row),
        userId: row.user_id,
        userName: row.name,
        userEmail: row.email
      }))
    });
  });

  router.get('/admin/cnh/:id/file', admin, twoFactorGuard, (req, res) => {
    const row = database
      .prepare('SELECT document_storage_key,mime_type FROM driver_documents WHERE id=?')
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Documento não encontrado.' });
    const filePath = path.join(privateDirectory, path.basename(row.document_storage_key));
    if (!fs.existsSync(filePath))
      return res.status(410).json({ error: 'Arquivo privado não está mais disponível.' });
    res
      .set('Cache-Control', 'no-store')
      .set('Content-Disposition', 'attachment; filename="cnh-analise"')
      .type(row.mime_type)
      .sendFile(filePath);
  });

  router.post('/admin/cnh/:id/review', admin, requireCsrf, twoFactorGuard, (req, res) => {
    const status = String(req.body?.status || '').toUpperCase();
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    if (!['APPROVED', 'REJECTED'].includes(status) || (status === 'REJECTED' && reason.length < 3))
      return res.status(400).json({ error: 'Revisão inválida.' });
    const now = Date.now();
    const result = database
      .prepare(
        'UPDATE driver_documents SET status=?,cnh_verified_at=?,cnh_verified_by=?,rejection_reason=?,updated_at=? WHERE id=?'
      )
      .run(
        status,
        status === 'APPROVED' ? now : null,
        req.session.userId,
        reason || null,
        now,
        req.params.id
      );
    if (!result.changes) return res.status(404).json({ error: 'Documento não encontrado.' });
    database
      .prepare(
        "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'CNH_REVIEWED','DRIVER_DOCUMENT',?,?,?)"
      )
      .run(req.session.userId, req.params.id, status, now);
    res.json({
      document: publicDocument(
        database.prepare('SELECT * FROM driver_documents WHERE id=?').get(req.params.id)
      )
    });
  });

  return { router, privateDirectory };
}

module.exports = {
  validDocument,
  validExpiry,
  publicDocument,
  requireApprovedCnh,
  createDriverDocumentsRouter
};
