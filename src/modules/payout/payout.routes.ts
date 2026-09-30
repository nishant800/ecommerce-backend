import { Router, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import { authenticate, type AuthRequest } from "../../middleware/auth.middleware.js";
import { sellerOnly } from "../../middleware/seller.middleware.js";
import Account from "../seller/sellerPayoutAccount.model.js";
import Earning, { SellerEarningEvent } from "../seller/sellerEarning.model.js";
import Payout from "./payout.model.js";
import { PayoutAccountService, publicAccountFields } from "./payout-account.service.js";
import { EarningService } from "./earning.service.js";
import { PayoutService } from "./payout.service.js";

const handle = (fn: (req: AuthRequest) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
    try { res.json({ success: true, serverTime: new Date().toISOString(), data: await fn(req) }); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error && error.name === "Error" ? error.message : "Unable to process this payment request" }); }
};
const id = (value: unknown) => {
    if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) throw new Error("Invalid ID");
    return value;
};
const page = (req: AuthRequest) => req.query.before ? { _id: { $lt: new mongoose.Types.ObjectId(id(req.query.before)) } } : {};
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
export const sellerFinanceRoutes = Router();
sellerFinanceRoutes.use(authenticate, sellerOnly);
sellerFinanceRoutes.get("/payout-account", handle(req => PayoutAccountService.get(req.user!.userId)));
sellerFinanceRoutes.put("/payout-account", limiter, handle(req => PayoutAccountService.save(req.user!.userId, req.body)));
sellerFinanceRoutes.post("/payout-account/verify", limiter, handle(req => PayoutAccountService.verify(req.user!.userId)));
sellerFinanceRoutes.get("/earnings/summary", handle(req => EarningService.summary(req.user!.userId)));
sellerFinanceRoutes.get("/earnings", handle(async req => Earning.find({ seller: req.user!.userId, ...page(req) }).sort({ _id: -1 }).limit(50)));
sellerFinanceRoutes.get("/earnings/:id", handle(async req => {
    const earning = await Earning.findOne({ _id: id(req.params.id), seller: req.user!.userId });
    if (!earning) throw new Error("Earning not found");
    return { earning, events: await SellerEarningEvent.find({ earning: earning._id }).sort({ revision: 1 }) };
}));
sellerFinanceRoutes.get("/payouts", handle(async req => Payout.find({ seller: req.user!.userId, ...page(req) }).sort({ _id: -1 }).limit(50).select("-webhookEventIds -accountSnapshot.providerFundAccountId")));
sellerFinanceRoutes.get("/payouts/:id", handle(async req => {
    const payout = await Payout.findOne({ _id: id(req.params.id), seller: req.user!.userId }).select("-webhookEventIds -accountSnapshot.providerFundAccountId");
    if (!payout) throw new Error("Payout not found");
    return payout;
}));

export const adminFinanceRoutes = Router();
adminFinanceRoutes.use(authenticate, (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== "admin" || req.user.accountRole !== "admin") { res.status(403).json({ success: false, message: "Admin access required" }); return; }
    next();
}, limiter);
adminFinanceRoutes.get("/payout-accounts", handle(async req => Account.find({ ...page(req) }).select(publicAccountFields).sort({ _id: -1 }).limit(50)));
adminFinanceRoutes.get("/sellers/:id/earnings/summary", handle(req => EarningService.summary(id(req.params.id))));
adminFinanceRoutes.get("/payouts", handle(async req => Payout.find({ ...page(req),
    ...(typeof req.query.status === "string" ? { status: req.query.status } : {}) }).sort({ _id: -1 }).limit(50)));
adminFinanceRoutes.post("/payouts/process", handle(() => PayoutService.processEligibleSellerPayouts()));
adminFinanceRoutes.post("/payouts/:id/retry", handle(async req => {
    const payout = await Payout.findById(id(req.params.id));
    if (!payout) throw new Error("Payout not found");
    if (["QUEUED", "PROCESSING"].includes(payout.status)) { await PayoutService.submit(String(payout._id)); return payout; }
    if (!["FAILED", "REVERSED"].includes(payout.status)) throw new Error("Payout cannot be retried");
    const newId = await PayoutService.reserve(String(payout.seller));
    if (newId) await PayoutService.submit(newId);
    return { payoutId: newId || null };
}));
adminFinanceRoutes.patch("/payout-accounts/:id", handle(async req => {
    if (typeof req.body.payoutHeld !== "boolean" && typeof req.body.isActive !== "boolean") throw new Error("Specify payoutHeld or isActive");
    const account = await Account.findById(id(req.params.id));
    if (!account) throw new Error("Account not found");
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
        await EarningService.lock(String(account.seller), session);
        await Account.updateOne({ _id: account._id }, { $set: {
            ...(typeof req.body.payoutHeld === "boolean" ? { payoutHeld: req.body.payoutHeld } : {}),
            ...(typeof req.body.isActive === "boolean" ? { isActive: req.body.isActive } : {}),
        } }, { session });
        await FinanceAdminAudit.create([{ actor: req.user!.userId, account: account._id,
            payoutHeld: req.body.payoutHeld, isActive: req.body.isActive }], { session });
    }); } finally { await session.endSession(); }
    return PayoutAccountService.get(String(account.seller));
}));
const FinanceAdminAudit = mongoose.model("FinanceAdminAudit", new mongoose.Schema({
    actor: mongoose.Schema.Types.ObjectId, account: mongoose.Schema.Types.ObjectId, payoutHeld: Boolean, isActive: Boolean,
}, { timestamps: { createdAt: true, updatedAt: false } }));
