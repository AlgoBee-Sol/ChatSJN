import mongoose, { Schema } from 'mongoose';
const opts = { timestamps: true } as const;
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    // Read only during the one-time migration to Better Auth credential accounts.
    passwordHash: { type: String, select: false },
    fullName: { type: String, default: '' },
    gender: { type: String, default: 'Prefer not to say' },
    age: { type: Number, default: null, min: 18 },
    marja: { type: String, enum: ['SISTANI', 'ALI_KHAMENEI'], default: 'SISTANI' },
    language: { type: String, enum: ['ur', 'en', 'roman'], default: 'ur' },
    role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },
    onboardingStep: { type: Number, default: 1 },
    onboardingComplete: { type: Boolean, default: false },
  },
  opts,
);
export const UserModel = mongoose.model('User', userSchema);
const conversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, default: 'New conversation' },
    busyUntil: Date,
    deletedAt: Date,
  },
  opts,
);
conversationSchema.index({ userId: 1, updatedAt: -1 });
export const ConversationModel = mongoose.model('Conversation', conversationSchema);
const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    citations: { type: [Schema.Types.Mixed], default: [] },
    marjaSnapshot: String,
    language: String,
    category: String,
    mode: String,
    requestId: String,
  },
  opts,
);
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index(
  { conversationId: 1, requestId: 1, role: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } },
);
export const MessageModel = mongoose.model('Message', messageSchema);
const sourceSchema = new Schema(
  {
    title: { type: String, required: true },
    scholar: { type: String, required: true },
    sourceCategory: { type: String, enum: ['FIQH', 'EDUCATIONAL'], required: true },
    religiousAuthorityId: {
      type: String,
      enum: ['SISTANI', 'ALI_KHAMENEI', 'JAWAD_NAQVI'],
      required: true,
    },
    topics: [String],
    language: String,
    originalSourceURL: String,
    sourceType: String,
    publication: String,
    version: String,
    section: String,
    rulingNumber: String,
    filePath: { type: String, select: false },
    fileHash: String,
    uploadedBy: Schema.Types.ObjectId,
    approvalStatus: {
      type: String,
      enum: ['DRAFT', 'PROCESSING', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'FAILED'],
      default: 'DRAFT',
    },
    reviewedBy: Schema.Types.ObjectId,
    reviewedAt: Date,
    everPublished: { type: Boolean, default: false },
    error: String,
    rightsConfirmed: Boolean,
  },
  opts,
);
sourceSchema.index({ approvalStatus: 1, sourceCategory: 1, religiousAuthorityId: 1 });
export const SourceDocument = mongoose.model('SourceDocument', sourceSchema);
const chunkSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'SourceDocument', required: true, index: true },
    originalText: { type: String, required: true },
    normalizedText: String,
    pageNumber: Number,
    section: String,
    rulingNumber: String,
    chunkIndex: Number,
    embedding: { type: [Number], default: [] },
    embeddingModel: String,
  },
  opts,
);
chunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
export const SourceChunk = mongoose.model('SourceChunk', chunkSchema);
export const IngestionJob = mongoose.model(
  'IngestionJob',
  new Schema(
    {
      documentId: { type: Schema.Types.ObjectId, required: true, index: true },
      status: String,
      error: String,
      finishedAt: Date,
    },
    opts,
  ),
);
export const AuditLog = mongoose.model(
  'AuditLog',
  new Schema(
    {
      actorId: Schema.Types.ObjectId,
      action: { type: String, required: true },
      resourceId: Schema.Types.ObjectId,
      detail: String,
    },
    opts,
  ),
);
export async function initModels() {
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}
