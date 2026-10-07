# ECSLocal Help

Authenticated support for customer and seller sessions. Role comes from the verified JWT, not an app header or submitted user ID. Seller sessions must also belong to a seller account. Customer sessions can belong to seller accounts, matching the existing two-app auth rules.

Configuration: backend-only AI_API_KEY, AI_MODEL (default gpt-4.1-mini), AI_SUPPORT_DAILY_LIMIT (default 30; bounded 1–100). No live API key is supplied by this change. No SDK/dependency was added. See backend/support.env.example. Common questions and support tickets work without a key; flexible questions return a safe 503 with Contact Support/Retry when the provider is absent or unavailable.

The OpenAI Responses API uses strict structured outputs and store:false. The model selects up to two knowledge IDs and a context topic; the server renders vetted knowledge plus fresh facts. Model-written statuses, policies, refund claims, tool calls and URLs are never displayed or executed. The model cannot mutate data. Confirmed support actions are dispatched by the backend registry to existing business services. Payment and shipping label actions reuse app workflows; completion is explained only from fresh backend facts. Provider storage is disabled; this does not replace the provider's contractual data/abuse-monitoring controls.

Knowledge is derived from the existing order/pickup workflows and policy.constants.ts. Review it when policies change. Help never promises refund approval, delivery time or settlement amounts. Account/fraud/wrong-order/payment disputes escalate. The assistant is advisory; only the user submits a ticket.

## APIs

All requests require Authorization: Bearer <session-token>. POST requests include role:customer or role:seller, matching the session.

- POST /api/support/chat: message (1–1500 chars), role, optional orderId/conversationId. Conversations are permanently bound to their original order context; start a new conversation for another order.
- GET /api/support/conversations: recent 20 own conversations.
- GET /api/support/conversations/:id: own bounded conversation history.
- POST /api/support/tickets: category, subject (1–120), message (1–2000), role, requestKey (16–100 URL-safe characters), optional orderId/conversationId. Retries with the same key reuse the ticket.
- GET /api/support/tickets: latest 30 own tickets, status and human resolution.
- GET /api/support/admin/tickets?status=open&page=1: human queue, 30 tickets per page; requires both admin JWT role and admin database role.
- PATCH /api/support/admin/tickets/:id: status open/in_progress/resolved, optional resolution (required when resolved). No auto-resolution, email delivery or response-time promise. Existing admin tooling can consume this queue; no new admin UI is included.

Conversations retain the last 40 messages and expire after 90 days of inactivity (Mongo TTL). Provider input includes at most 4 recent user messages, safe context and role-filtered knowledge. Names, email, phone, addresses, bank fields, pickup QR/token and gateway IDs are excluded. Recognizable credentials and long numbers in free text are redacted before persistence/provider use. Do not enter secrets into chat. Support does not log prompt/provider payloads. Ticket subjects, messages and human resolutions are sanitized too.

Chat is limited to 20 requests per user per 10 minutes; tickets to 6 per user per hour; all routes to 120 per IP per 10 minutes. These burst limiters use the installed express-rate-limit memory store, per process. AI daily quotas use atomic Mongo buckets shared across instances. For horizontally scaled burst limits, configure a shared express-rate-limit store before scaling. Authentication uses the existing middleware.

## Validation

node tests/run-support-tests.mjs runs isolated integration tests with mocked provider responses and fixture accounts. It expects a local Mongo replica set on 127.0.0.1:27119, replicaSet financeTest, following existing test conventions. It never loads the real backend .env or calls the real AI provider. Run npm run build first. Mobile checks: node node_modules/typescript/bin/tsc --noEmit in each app. Use the existing Android/iOS development setup to verify screens and animations on device.

Official provider reference: https://developers.openai.com/api/docs/guides/structured-outputs and https://developers.openai.com/api/docs/guides/migrate-to-responses .

## Controlled actions

The registry in support.actions.ts defines the 12 customer and 9 seller action types (17 distinct types), roles, resource validation, confirmation requirement, executor, and audit event. Chat buttons are generated from backend eligibility, never raw model JSON or provider tool calls. There are no model-selected executors or API URLs.

POST /api/support/actions/propose accepts role, type, optional resourceId; ticket proposals also accept category/subject/message. Server-owned confirmation details are returned with a random 256-bit proposal token, valid for five minutes. Only its SHA-256 hash is persisted. POST /api/support/actions/execute accepts role, actionToken and confirmed:true when required. Every proposal is atomically claimed once and eligibility is checked again. Failed or interrupted claims cannot be replayed; request a fresh proposal and inspect current state. Concurrent repeats are rejected. Ticket requests use the existing unique request key.

POST /api/support/actions/refresh validates proposal ownership and returns fresh backend context following app payment/label workflows; it does not trust a client success claim. Audit records contain actor, role, type, resource, result, timestamps and source ai_support. They contain no raw tokens or credentials. Proposals and audit records are retained for review; define retention appropriate to the deployment. Chat and proposal/execution rate limits are separate: proposals 30 and execution 10 per account per ten minutes, in addition to the shared route limit.

RESERVE_PICKUP_AGAIN checks stock, original variant/option, pickup seller address, current schedule and full two-hour window. It opens the current product flow so the customer selects fulfillment/quantity/payment and confirms a new reservation normally. Multi-item historical reservations direct the user to rebuild a cart instead of silently changing it. PAY_PICKUP_ONLINE and RETRY_PAYMENT reuse verified gateway flows. GENERATE_SHIPPING_LABEL reuses the PDF helper and existing label-confirmation backend service. Delivery/scanner actions navigate; support cannot mark Out for Delivery or Delivered.
