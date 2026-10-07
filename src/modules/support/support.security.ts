import { SupportError } from './support.types.js';
// Apply before persistence, provider requests and responses. Never log raw prompts or provider errors.
export function sanitizeSupportText(value: string): string {
    let text = value.normalize('NFKC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    for (const secret of [process.env.AI_API_KEY, process.env.JWT_SECRET, process.env.MONGO_URI, process.env.RAZORPAY_KEY_SECRET, process.env.FIREBASE_SERVICE_ACCOUNT].filter((s): s is string => Boolean(s && s.length >= 4))) text = text.split(secret).join('[private information removed]');
    return text
        .replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, '[private key removed]')
        .replace(/(?:mongodb(?:\+srv)?|postgres(?:ql)?):\/\/[^\s]+/gi, '[connection removed]')
        .replace(/\b[a-f0-9]{48,}\b/gi, '[token removed]')
        .replace(/\bBearer\s+[^\s]+/gi, '[token removed]')
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token removed]')
        .replace(/\b(?:sk-|rzp_(?:live|test)_)[A-Za-z0-9_-]{8,}\b/g, '[key removed]')
        .replace(/\b(?:password|passwd|otp|pin|cvv|secret|api[_ -]?key|token|bank[_ -]?account|account[_ -]?number)\s*(?:is|:|=)\s*[^\s,;]+/gi, '[private information removed]')
        .replace(/\b(?:password|passwd|otp|pin|cvv|secret|api[_ -]?key|token|bank[_ -]?account|account[_ -]?number)["']?\s+(?:(?:is|:)\s*)?["']?[^\s,;}]+/gi, '[private information removed]')
        .replace(/\b(?:password|passwd|otp|pin|cvv|secret|api[_ -]?key|token)["']?\s*[:=]\s*["']?[^\s,;}]+/gi, '[private information removed]')
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
        .replace(/\b\d(?:[ -]?\d){7,18}\b/g, '[number removed]').trim();
}
export function supportText(value: unknown, max: number, name = 'Message') {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new SupportError(400, name + ' must contain 1–' + max + ' characters.');
    const text = sanitizeSupportText(value);
    if (!text) throw new SupportError(400, name + ' is required.');
    return text.slice(0, max);
}
