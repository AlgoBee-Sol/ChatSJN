import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { getAuth, googleEnabled } from './auth-engine.js';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import mongoose from 'mongoose';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { z, ZodError } from 'zod';
import { profileSchema, questionSchema, sourceSchema } from '@sjn/shared';
import { config } from './config.js';
import { AppError } from './errors.js';
import { csrf, requireAuth, requireAdmin, publicUser, authOrigin } from './auth.js';
import {
  UserModel,
  ConversationModel,
  MessageModel,
  SourceDocument,
  SourceChunk,
  AuditLog,
  IngestionJob,
} from './models.js';
import { ingest, embedDocument } from './ingestion.js';
import { ChatService } from './rag/chat-service.js';
import { productionProviders, type Providers } from './rag/providers.js';
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2 },
});
export function createApp(providers: Providers = productionProviders) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'font-src': ["'self'"],
          'connect-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'style-src': ["'self'", "'unsafe-inline'"],
        },
      },
      strictTransportSecurity: config.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
    }
    next();
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.NODE_ENV === 'test' ? 1000 : 25,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please try again in 15 minutes.',
      },
    },
  });
  app.get('/api/auth/config', (_req, res) =>
    res.json({ googleEnabled, origin: config.APP_ORIGIN }),
  );
  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));
  // Better Auth must read the original request stream before Express parses JSON.
  app.all('/api/auth/*splat', authLimit, authOrigin, (req, res) => {
    // Overwrite any client-supplied value. Express only trusts forwarded IPs when
    // an explicit deployment proxy policy is configured (currently disabled).
    req.headers['x-sjn-client-ip'] = req.ip || req.socket.remoteAddress || '';
    return toNodeHandler(getAuth())(req, res);
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', csrf);
  const chatLimit = rateLimit({
    windowMs: 60000,
    limit: config.NODE_ENV === 'test' ? 1000 : 15,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Please wait a moment before asking another question.',
      },
    },
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '0.1.0' }));
  app.get('/api/ready', (_req, res) =>
    res
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ database: mongoose.connection.readyState === 1, aiConfigured: providers.configured }),
  );
  app.patch('/api/profile', requireAuth, async (req, res) => {
    const input = profileSchema.parse(req.body);
    const user = await UserModel.findById(req.user!.id);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in.');
    const { complete, ...fields } = input;
    Object.assign(user, fields);
    if (complete) {
      if (!user.fullName || !user.marja || !user.language || !user.age || user.age < 18)
        throw new AppError(400, 'INCOMPLETE_PROFILE', 'Complete your profile before continuing.');
      user.onboardingComplete = true;
      user.onboardingStep = 4;
    }
    await user.save();
    res.json({ user: publicUser(user) });
  });
  app.get('/api/sessions', requireAuth, async (req, res) => {
    const sessions = await getAuth().api.listSessions({ headers: fromNodeHeaders(req.headers) });
    res.json({
      sessions: sessions.map((session) => ({
        _id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      })),
    });
  });
  app.use('/api/conversations', requireAuth, (req, _res, next) => {
    if (!req.user!.onboardingComplete)
      throw new AppError(403, 'ONBOARDING_REQUIRED', 'Please complete your profile first.');
    next();
  });
  app.get('/api/conversations', async (req, res) => {
    const { page, limit } = pagination.parse(req.query);
    const filter = { userId: req.user!.id, deletedAt: null };
    const [items, total] = await Promise.all([
      ConversationModel.find(filter)
        .select('-busyUntil -deletedAt')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ConversationModel.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  });
  app.post('/api/conversations', async (req, res) => {
    const conversation = await ConversationModel.create({ userId: req.user!.id });
    res.status(201).json({ conversation });
  });
  app.use('/api/conversations/:id', async (req, _res, next) => {
    const conversation = await ConversationModel.findOne({
      _id: id.parse(req.params.id),
      userId: req.user!.id,
      deletedAt: null,
    });
    if (!conversation) throw new AppError(404, 'NOT_FOUND', 'Conversation not found.');
    next();
  });
  app.get('/api/conversations/:id/messages', async (req, res) => {
    const { page, limit } = pagination.parse(req.query);
    const filter = { conversationId: req.params.id };
    const [items, total] = await Promise.all([
      MessageModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      MessageModel.countDocuments(filter),
    ]);
    res.json({ items: items.reverse(), total, page, limit });
  });
  app.patch('/api/conversations/:id', async (req, res) => {
    const input = z.object({ title: z.string().trim().min(1).max(100) }).parse(req.body);
    await ConversationModel.updateOne(
      { _id: req.params.id, userId: req.user!.id },
      { $set: input },
    );
    res.json({ ok: true });
  });
  app.delete('/api/conversations/:id', async (req, res) => {
    const removed = await ConversationModel.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user!.id,
        $or: [{ busyUntil: { $lt: new Date() } }, { busyUntil: null }],
      },
      { $set: { deletedAt: new Date() } },
    );
    if (!removed)
      throw new AppError(
        409,
        'BUSY',
        'Wait for the current answer before deleting this conversation.',
      );
    await MessageModel.deleteMany({ conversationId: req.params.id });
    res.status(204).end();
  });
  app.post('/api/conversations/:id/messages', chatLimit, async (req, res) => {
    const input = questionSchema.parse(req.body);
    const conversationId = String(req.params.id);
    const existing = await MessageModel.findOne({
      conversationId,
      requestId: input.requestId,
      role: 'assistant',
    });
    if (existing) {
      res
        .type('text/event-stream')
        .end(`data: ${JSON.stringify({ type: 'done', message: existing })}\n\n`);
      return;
    }
    const locked = await ConversationModel.findOneAndUpdate(
      {
        _id: conversationId,
        userId: req.user!.id,
        deletedAt: null,
        $or: [{ busyUntil: { $lt: new Date() } }, { busyUntil: null }],
      },
      { $set: { busyUntil: new Date(Date.now() + 300000) } },
    );
    if (!locked)
      throw new AppError(409, 'BUSY', 'An answer is already being prepared for this conversation.');
    try {
      const result = await new ChatService(providers).answer(
        req.user!,
        input.question,
        conversationId,
      );
      await MessageModel.updateOne(
        { conversationId, requestId: input.requestId, role: 'user' },
        {
          $setOnInsert: {
            conversationId,
            userId: req.user!.id,
            requestId: input.requestId,
            role: 'user',
            content: input.question,
            marjaSnapshot: req.user!.marja,
            language: result.language,
          },
        },
        { upsert: true },
      );
      const answer = await MessageModel.create({
        conversationId,
        userId: req.user!.id,
        requestId: input.requestId,
        role: 'assistant',
        ...result,
      });
      await ConversationModel.updateOne(
        { _id: conversationId },
        {
          $set: {
            ...(locked.title === 'New conversation' ? { title: input.question.slice(0, 65) } : {}),
            updatedAt: new Date(),
          },
        },
      );
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      for (const token of result.content.match(/.{1,60}(?:\s|$)|.{1,60}/gs) || []) {
        if (res.destroyed) break;
        res.write(`data: ${JSON.stringify({ type: 'delta', text: token })}\n\n`);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      if (!res.destroyed) res.end(`data: ${JSON.stringify({ type: 'done', message: answer })}\n\n`);
    } finally {
      await ConversationModel.updateOne({ _id: conversationId }, { $unset: { busyUntil: 1 } });
    }
  });
  app.use('/api/admin', requireAuth, requireAdmin);
  app.get('/api/admin/sources', async (req, res) => {
    const { page, limit } = pagination.parse(req.query);
    const q = z
      .string()
      .max(100)
      .parse(req.query.q || '');
    const filter = q
      ? { title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
      : {};
    const [items, total] = await Promise.all([
      SourceDocument.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      SourceDocument.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  });
  app.get('/api/admin/sources/:id', async (req, res) => {
    const source = await SourceDocument.findById(id.parse(req.params.id));
    if (!source) throw new AppError(404, 'NOT_FOUND', 'Source not found.');
    res.json({
      source,
      chunks: await SourceChunk.find({ documentId: source.id })
        .select('-embedding -normalizedText')
        .sort({ chunkIndex: 1 }),
      jobs: await IngestionJob.find({ documentId: source.id }).sort({ createdAt: -1 }).limit(10),
    });
  });
  app.post('/api/admin/sources', upload.single('file'), async (req, res) => {
    let metadata: unknown;
    try {
      metadata = JSON.parse(req.body.metadata);
    } catch {
      throw new AppError(400, 'INVALID_METADATA', 'Source metadata must be valid JSON.');
    }
    const input = sourceSchema.parse(metadata);
    if (!req.file) throw new AppError(400, 'FILE_REQUIRED', 'Choose a PDF, TXT or Markdown file.');
    const type = extname(req.file.originalname).slice(1).toLowerCase();
    if (!['pdf', 'txt', 'md'].includes(type))
      throw new AppError(
        400,
        'UNSUPPORTED_FILE',
        'Only PDF, TXT and Markdown files are supported.',
      );
    await mkdir(config.UPLOAD_DIR, { recursive: true });
    const path = resolve(config.UPLOAD_DIR, `${randomUUID()}.${type}`);
    await writeFile(path, req.file.buffer, { flag: 'wx', mode: 0o600 });
    try {
      const source = await SourceDocument.create({
        ...input,
        sourceType: type,
        filePath: path,
        fileHash: createHash('sha256').update(req.file.buffer).digest('hex'),
        uploadedBy: req.user!.id,
      });
      await AuditLog.create({
        actorId: req.user!.id,
        action: 'SOURCE_UPLOAD',
        resourceId: source._id,
      });
      const processed = await ingest(source.id);
      res.status(201).json({ source: await SourceDocument.findById(processed.id) });
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
  });
  app.post('/api/admin/sources/:id/action', async (req, res) => {
    const sourceId = id.parse(req.params.id);
    const { action } = z
      .object({ action: z.enum(['approve', 'reject', 'unpublish', 'reprocess']) })
      .parse(req.body);
    let source = await SourceDocument.findById(sourceId);
    if (!source) throw new AppError(404, 'NOT_FOUND', 'Source not found.');
    if (action === 'reprocess') {
      await ingest(sourceId);
    } else if (action === 'approve') {
      if (!providers.configured)
        throw new AppError(
          503,
          'AI_NOT_CONFIGURED',
          'Configure embeddings before publishing this source. Extraction and review are available now.',
        );
      const claimed = await SourceDocument.findOneAndUpdate(
        { _id: sourceId, approvalStatus: 'READY_FOR_REVIEW' },
        { $set: { approvalStatus: 'PROCESSING' } },
        { returnDocument: 'after' },
      );
      if (!claimed)
        throw new AppError(
          409,
          'INVALID_STATE',
          'Only reviewed, unpublished material can be approved.',
        );
      try {
        if (!claimed.everPublished) await embedDocument(sourceId, providers.embeddings);
        else if (
          (await SourceChunk.countDocuments({
            documentId: sourceId,
            embeddingModel: providers.embeddings.model,
          })) !== (await SourceChunk.countDocuments({ documentId: sourceId }))
        )
          throw new AppError(
            409,
            'MODEL_CHANGED',
            'Upload a new version to change the embedding model.',
          );
        await SourceDocument.updateOne(
          { _id: sourceId },
          {
            $set: {
              approvalStatus: 'APPROVED',
              everPublished: true,
              reviewedBy: req.user!.id,
              reviewedAt: new Date(),
            },
          },
        );
      } catch (error) {
        await SourceDocument.updateOne(
          { _id: sourceId },
          { $set: { approvalStatus: 'READY_FOR_REVIEW' } },
        );
        throw error;
      }
    } else {
      if (source.approvalStatus === 'PROCESSING')
        throw new AppError(409, 'BUSY', 'Wait for source processing to finish.');
      if (action === 'unpublish' && source.approvalStatus !== 'APPROVED')
        throw new AppError(409, 'INVALID_STATE', 'This source is not published.');
      source.approvalStatus = action === 'reject' ? 'REJECTED' : 'READY_FOR_REVIEW';
      source.reviewedBy = new mongoose.Types.ObjectId(req.user!.id);
      source.reviewedAt = new Date();
      await source.save();
    }
    await AuditLog.create({
      actorId: req.user!.id,
      action: `SOURCE_${action.toUpperCase()}`,
      resourceId: source._id,
    });
    source = await SourceDocument.findById(sourceId);
    res.json({ source });
  });
  app.use('/api', (_req, _res) => {
    throw new AppError(404, 'NOT_FOUND', 'API route not found.');
  });
  if (config.NODE_ENV === 'production') {
    const web = resolve('apps/web/dist');
    app.use(express.static(web, { index: false }));
    app.get('/{*path}', (req, res) => {
      if (req.path !== '/') res.setHeader('X-Robots-Tag', 'noindex');
      res.sendFile(resolve(web, req.path === '/' ? 'index.html' : 'private/index.html'));
    });
  }
  app.use(
    (error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      let status = 500,
        code = 'INTERNAL_ERROR',
        message = 'Something went wrong. Please try again.';
      if (error instanceof AppError) {
        ({ status, code, message } = error);
      } else if (error instanceof ZodError) {
        status = 400;
        code = 'VALIDATION_ERROR';
        message = error.issues[0]?.message || 'Check your input.';
      } else if (error instanceof multer.MulterError) {
        status = 400;
        code = 'UPLOAD_ERROR';
        message = 'Upload rejected. Use one file no larger than 8 MB.';
      } else if (error instanceof Error && 'code' in error && error.code === 11000) {
        status = 409;
        code = 'CONFLICT';
        message = 'This record already exists. If you have an account, please sign in.';
      } else if (error instanceof SyntaxError) {
        status = 400;
        code = 'INVALID_JSON';
        message = 'Invalid request data.';
      }
      if (status >= 500) console.error(JSON.stringify({ requestId: req.requestId, code, status }));
      res.status(status).json({ error: { code, message, requestId: req.requestId } });
    },
  );
  return app;
}
