import mongoose, { Schema } from 'mongoose';
import type { SupportRole, SupportMessage, SupportCategory } from './support.types.js';
import { CATEGORIES } from './support.types.js';
interface Conversation { userId: mongoose.Types.ObjectId; role: SupportRole; messages: SupportMessage[]; relatedOrderId?: mongoose.Types.ObjectId; status: 'active' | 'escalated'; createdAt: Date; updatedAt: Date }
const messageSchema = new Schema<SupportMessage>({ role: { type: String, enum: ['user', 'assistant'], required: true }, content: { type: String, maxlength: 4000, required: true }, createdAt: { type: Date, default: Date.now } }, { _id: false });
const conversationSchema = new Schema<Conversation>({ userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, role: { type: String, enum: ['customer', 'seller'], required: true }, messages: { type: [messageSchema], default: [] }, relatedOrderId: { type: Schema.Types.ObjectId, ref: 'Order' }, status: { type: String, enum: ['active', 'escalated'], default: 'active' } }, { timestamps: true });
conversationSchema.index({ userId: 1, role: 1, updatedAt: -1 });
conversationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 86400 });
export const SupportConversation = mongoose.model<Conversation>('SupportConversation', conversationSchema);
interface Ticket { userId: mongoose.Types.ObjectId; role: SupportRole; category: SupportCategory; subject: string; message: string; relatedOrderId?: mongoose.Types.ObjectId; conversationId?: mongoose.Types.ObjectId; requestKey: string; status: 'open' | 'in_progress' | 'resolved'; resolution?: string; resolvedAt?: Date; createdAt: Date; updatedAt: Date }
const ticketSchema = new Schema<Ticket>({ userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, role: { type: String, enum: ['customer', 'seller'], required: true }, category: { type: String, enum: CATEGORIES, required: true }, subject: { type: String, maxlength: 120, required: true }, message: { type: String, maxlength: 2000, required: true }, relatedOrderId: { type: Schema.Types.ObjectId, ref: 'Order' }, conversationId: { type: Schema.Types.ObjectId, ref: 'SupportConversation' }, requestKey: { type: String, required: true, maxlength: 100 }, status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' }, resolution: { type: String, maxlength: 2000 }, resolvedAt: Date }, { timestamps: true });
ticketSchema.index({ userId: 1, role: 1, requestKey: 1 }, { unique: true });
ticketSchema.index({ status: 1, createdAt: -1 });
export const SupportTicket = mongoose.model<Ticket>('SupportTicket', ticketSchema);
const quotaSchema = new Schema({ userId: { type: Schema.Types.ObjectId, required: true }, day: { type: String, required: true }, calls: { type: Number, default: 0 }, expiresAt: { type: Date, required: true } });
quotaSchema.index({ userId: 1, day: 1 }, { unique: true });
quotaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const SupportQuota = mongoose.model('SupportQuota', quotaSchema);
