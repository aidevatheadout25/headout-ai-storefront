# Building a Scaled App: From PRD to Deployment

A reference doc for the Applied AI team on how to approach system design and build production-grade applications, end to end.

This doc is meant to be used in two ways: as a walkthrough for understanding the process, and as a reference you share with Claude when starting a new project. Follow the sequence. Don't skip steps.

---

## P0: PRD and User Journeys (First Draft)

Everything starts here. Before any engineering decisions, define the product.

**What to do:**

- Write the PRD. Define what the app does, who uses it, and how it should behave.
- Map every user journey. Walk through each flow start to finish.
- Split features into phases during the PRD itself. Phase 1 = the minimum set of features to put something usable in front of users. Phase 2, 3, etc. = everything else. This phasing carries forward into every subsequent step. If you skip this, you end up building everything at once and shipping nothing.

**This is a first draft, not the final version.** The PRD will get updated based on findings from the next two parallel steps (frontend prototype and crux identification). It only locks after both of those feedback loops are complete.

---

## Frontend Prototype + Crux Identification (Parallel)

These two steps run in parallel after the PRD first draft. Both will produce findings that change the PRD. That's the point — it's cheaper to discover problems here than after system design or during implementation.

### Frontend Prototype (Dummy Data)

Build a lightweight frontend prototype with dummy/hardcoded data based on the PRD and user journeys.

**Why this matters:**

- Visualising the actual screens and flows exposes gaps that the PRD missed. Features you thought were necessary turn out to be unnecessary, and vice versa.
- Stakeholder communication becomes dramatically easier when there's something to look at and click through. Show the prototype, collect feedback, update the PRD.
- This saves significant time on backend design. You don't want to build API endpoints for screens that change or get cut after you see them rendered.
- The prototype also validates the data layer: by building the screens, you discover what data each screen actually needs, which directly informs the database schema and API contract later.

### Crux Identification

Figure out what is technically hard or risky about this project.

**What to do:**

- List all the high-level problem areas. Not just the single hardest thing, but every non-trivial piece.
- List all external dependencies and third-party services the app will rely on.
- For each crux:
  - If there is high uncertainty (you don't know if it's even solvable the way you're imagining), build a quick, throwaway prototype. Prove the concept before designing around it.
  - If the solution is known and existing services can handle it, document the high-level engineering approach for how you'll use those services.

**Third-party services — check rate limits first:**

- Before committing to any external service, check its rate limits and pricing tiers. The rate limits will dictate how you design the system around that service (queuing, caching, batching, fallback handling). This is a system design input, not an afterthought.
- Ask: what happens if this service goes down or becomes unreachable? If the answer is "the whole app breaks," you need a fallback plan before you proceed.

**Why crux work can run in parallel with the prototype:** The crux items (hardest technical problems, critical external services) are usually independent of UI details. Whether a button lives on page A or page B doesn't change the fact that you need to figure out how a specific third-party API behaves at scale. However, if a crux finding makes a feature impractical (e.g., rate limits are too restrictive, a service can't do what you assumed), that's a product-level change that feeds back into the PRD.

---

## Lock the PRD

After the frontend prototype feedback loop and crux investigation are both complete, the PRD gets updated and locked.

- Incorporate stakeholder feedback from the prototype walkthrough.
- Incorporate any scope changes from crux findings (features dropped, added, or modified because of technical constraints).
- Re-confirm the phase distribution. The findings from both steps may shift what belongs in Phase 1 vs. Phase 2.

**Once locked, the PRD is the contract.** Everything downstream (system design, ERD, implementation) builds against this version. Changes after this point are possible but should be treated as scope changes, not casual tweaks.

---

## System Design

This is where you decide _how_ the app is built. The PRD defines what the app does. The database schema defines what data it stores. System design is the layer that decides how everything connects, scales, and stays reliable. This step starts only after the PRD is locked.

When working through this section with Claude, share your locked PRD, user journeys, frontend prototype, and the load numbers below. Ask Claude to design the architecture with you, don't just accept the first answer. Push on tradeoffs.

### Step 1: Establish Load Parameters

Get realistic numbers before making any architecture decisions. These numbers drive every choice that follows.

- How many total users will use this app?
- How many concurrent users at peak?
- How frequently do users interact (requests per minute/second per user)?
- What are the heaviest operations (e.g., file processing, complex queries, third-party API calls)?
- What's the expected data growth rate? (e.g., how many new records per day/week)

If you don't have exact numbers, estimate ranges (low/medium/high) and design for the medium case with a plan for the high case.

### Step 2: Architecture Decisions

Work through each of these based on your load parameters. For each decision, document what you chose AND why.

**Service boundaries:**
- Can the entire app run as a single service, or does the complexity/load require splitting into separate services?
- Rule of thumb: start with a single service unless you have a clear reason to split (e.g., one part of the app has wildly different scaling needs than another, or separate teams will own different parts).

**Synchronous vs. asynchronous processing:**
- Which user actions need an immediate response? (These stay synchronous.)
- Which operations can happen in the background? (File processing, email sending, report generation, third-party API calls with slow response times — these should be offloaded to background workers.)
- If you have background work, you need a queue system. The queue holds the tasks, workers pick them up and process them. Ask Claude to help you decide between options (Redis queues, RabbitMQ, SQS, etc.) based on your volume and reliability needs.

**Caching:**
- Identify the data that is read frequently but written rarely. This is your first caching candidate.
- Decide how stale the cached data can be. If users can tolerate data that's 5 minutes old, a simple TTL (time-to-live) cache works. If data must always be fresh, you need to invalidate the cache every time a write happens.
- Common pattern: check cache first → if found, return it → if not, query the database, store the result in cache, return it. This is called cache-aside.
- Don't cache everything. Start with the queries that are slowest or most frequently hit.

**Communication protocols:**
- HTTP/REST is the default for most apps. Use it unless you have a specific reason not to.
- WebSockets are needed when the server needs to push data to the client in real-time (live chat, live dashboards, collaborative editing).
- If you need real-time updates but not bidirectional communication, Server-Sent Events (SSE) are simpler than WebSockets.

**Deployment topology:**
- Single service deployed as one unit, or separate services that deploy independently?
- Where will it be deployed? (Cloud provider, region, containerised or not?)

### Step 3: Database Design

This section deserves careful attention. A poorly designed database is the single most common reason apps slow down or become painful to modify later.

**Choose the database type based on your data, not based on what's popular:**
- Relational (PostgreSQL, MySQL): use when your data has clear relationships between entities, you need transactional consistency, or you'll run complex queries with JOINs. This is the right default for most apps.
- Document (MongoDB): use when your data structure varies significantly across records, or you're storing nested/hierarchical data that would require many JOINs in a relational DB.
- You can use both if different parts of your app have different needs.

**Design tables around access patterns, not just entities:**
- Before creating any table, list the most frequent queries the app will run. "Show me all orders for user X sorted by date." "Get the 10 most recent comments on post Y." "Count active users in the last 7 days."
- Design your tables and indexes so that these frequent queries are fast. This matters more than having a theoretically clean schema.

**Indexing strategy:**
- Every column that appears in a WHERE clause, JOIN condition, or ORDER BY in a frequent query is a candidate for an index.
- Composite indexes (indexes on multiple columns) are needed when queries filter on multiple columns together. The column order in the index matters — put the most selective column first.
- Don't over-index. Every index speeds up reads but slows down writes, because the database has to update the index on every insert/update/delete. High-write tables should have fewer indexes.

**Query design considerations:**
- N+1 query problem: if you're fetching a list of items and then making a separate query for each item's related data, that's N+1 queries. Use JOINs or batch queries instead.
- Pagination: for any endpoint that returns a list, decide on the pagination approach. Cursor-based pagination (using the last item's ID/timestamp to fetch the next page) performs better at scale than offset-based pagination (OFFSET 100 LIMIT 10), because offset forces the database to scan and skip rows.

**Schema migration planning:**
- Never make destructive schema changes in a single step on a live app. The safe pattern: add the new column → deploy code that writes to both old and new → backfill existing data → deploy code that reads from new → remove the old column. Ask Claude to help plan migrations for each chunk.

**Connection pooling:**
- Your app should not open a new database connection for every request. Use a connection pool (a set of pre-opened connections that get reused).
- Size the pool based on: concurrent users × average queries per request, capped by the database's max connection limit. Ask Claude to configure this for your chosen database and framework.

### Step 4: API Design

**Endpoint design:**
- Convert each user journey into the backend API calls it requires. Each screen/action in the frontend maps to one or more API calls.
- Use consistent URL patterns. Nouns for resources, HTTP methods for actions: GET /users, POST /users, GET /users/:id, PUT /users/:id, DELETE /users/:id.
- Every list endpoint gets pagination from day one. Don't add it later.

**Request and response structure:**
- Standardise the response format across all endpoints. A common pattern: `{ data: ..., error: null }` for success, `{ data: null, error: { code: "...", message: "...", fields: [...] } }` for errors.
- For endpoints that create or modify resources (POST, PUT), define what the request body looks like and validate every field on the server side. Never trust client input.

**Authentication and authorisation:**
- Decide the auth mechanism: JWT tokens, session-based auth, or API keys (for service-to-service calls). Ask Claude to help you choose based on your use case.
- Authorisation = who can do what. Define roles and permissions early. Don't bolt this on after building 20 endpoints.

**Rate limiting your own APIs:**
- Even for internal apps, set rate limits per user/client to prevent a single misbehaving client from overloading the system.

### Step 5: Resilience and Failure Handling

Apps break. Third-party services go down. Databases hit connection limits. This section is about making sure the app degrades gracefully instead of crashing entirely.

**Timeouts on every outbound call:**
- Every call to a database, external API, or any other service needs a timeout. Without a timeout, a single slow dependency can freeze the entire app as requests pile up waiting.
- Ask Claude to set appropriate timeout values for each dependency based on expected response times.

**Retry logic for external calls:**
- When an external call fails, don't immediately give up and don't retry in a tight loop. Use exponential backoff: wait 1s, then 2s, then 4s, with a maximum number of retries.
- Only retry on transient errors (timeouts, 5xx responses). Don't retry on 4xx (client errors).

**Idempotency for critical operations:**
- If a user submits a payment, creates an order, or triggers any state change, and the request gets retried (network glitch, user double-clicks), it should not create duplicate records or charge them twice.
- The standard solution: the client sends a unique idempotency key with the request. The server checks if it's already processed that key and returns the previous result instead of processing again.

### Step 6: Observability

You need to know what your app is doing in production. Set this up from the start, not after something breaks.

**Logging:**
- Use structured logs (JSON format) so they can be searched and filtered.
- Log at the right level: INFO for business events (user signed up, order placed), ERROR for failures (API call failed, database error), DEBUG for troubleshooting (request payload, intermediate state). Don't log sensitive data (passwords, tokens, personal information).

**Monitoring:**
- Track: response times (p50, p95, p99), error rates per endpoint, database query times, queue depth (if using workers), memory and CPU usage.
- Ask Claude to help set up a basic monitoring dashboard for your tech stack.

**Alerting:**
- Set alerts for conditions that need human attention: error rate spikes above a threshold, response times exceeding acceptable limits, queue depth growing faster than workers can drain it, disk/memory approaching capacity.

### Step 7: Security Baseline

Even for internal tools, don't skip these.

- **Input validation:** Validate and sanitise all user input at the API boundary. SQL injection, XSS, and similar attacks happen when raw input reaches the database or frontend unfiltered.
- **Secrets management:** Database passwords, API keys, and tokens live in environment variables or a secrets manager. Never in the codebase.
- **HTTPS everywhere.** No exceptions.
- **CORS policy:** Configure which domains can call your API. Don't leave it open to all origins in production.

### Step 8: Visualise the Architecture

After working through the above decisions, create a high-level architecture diagram. This diagram should show:

- Services and how they communicate (HTTP, WebSocket, queue)
- Database(s) and which service owns which data
- External dependencies and where they connect
- Cache layer placement
- Worker/queue topology
- The request flow for the most common user journeys

This diagram lives in the Engineering Requirement Document and becomes the shared reference for the entire team.

---

## The Engineering Requirement Document (ERD)

The ERD is the master engineering document for the project. It is not a single artifact created in one sitting — it gets assembled as you work through the steps above.

**The ERD contains:**

- User journeys (from the PRD)
- Phase-wise scope breakdown
- System design architecture and diagram
- Database schema (tables, relationships, indexes, keys)
- Backend API contract (endpoints, request/response shapes, auth)
- Frontend page overview (screens per user journey)
- Chunk distribution (how the work is split for implementation)

**Phase-awareness in the ERD:**

- The ERD's detailed sections cover the current phase's scope. Future phase features are noted at a high level so the schema and architecture don't block them, but detailed specs for future phases are written when those phases start.
- During execution, things will shift between phases. That's expected. The ERD is a living document, not a frozen spec.

**When working with Claude:** The ERD is the source of truth, but you don't load the full ERD into every implementation session. Instead, you extract a chunk scope doc from it for each chunk (see Implementation section below). The full ERD stays as the reference you return to when scoping each new chunk.

---

## Implementation: Chunk-by-Chunk

### How to chunk:

- Break the ERD's feature set into discrete chunks. Each chunk = one major flow or logical unit that can be built and tested independently.
- Prioritise chunks based on the current phase's scope. Phase 1 chunks ship first.
- The chunk order should respect dependencies: if Chunk B needs a table or API from Chunk A, Chunk A goes first.

### How to execute each chunk:

- **One branch per chunk.** Each chunk lives on its own git branch.

- **Extract a chunk scope doc from the ERD.** Before writing code, open the full ERD and extract a standalone chunk scope doc. This doc contains two things:
  - **The chunk's own scope:** which tables it creates/modifies, which API endpoints it implements, what the acceptance criteria are, and what "done" looks like.
  - **Boundary contracts with adjacent chunks:** the schemas of tables this chunk reads from but doesn't own (created by earlier chunks), the API contracts it calls or depends on, and the data shapes it receives from or sends to other parts of the app.
  
  The boundary contracts are what make this approach work. Without them, Claude will make decisions in isolation that break consistency across chunks, and you'll discover it during integration. With them, the chunk scope doc has everything Claude needs to build correctly without loading the full ERD.

- **One session per chunk.** Start a fresh Claude session for each chunk. Load only the chunk scope doc (not the full ERD). Clear the context after the chunk is complete. If something genuinely unexpected comes up mid-implementation that the chunk scope doc doesn't cover, pull in the specific ERD section at that point rather than loading the whole thing upfront.

- **Build backend APIs first, then integrate with the existing frontend.** The frontend prototype already exists with dummy data. For each chunk, build the backend APIs that serve that chunk's data, then replace the dummy data in the frontend with real API calls. This is the integration step.

- **Write tests alongside each chunk,** not "later." At minimum: test the API endpoints for correct responses and error handling, and test the critical business logic. Ask Claude to generate tests as part of the chunk implementation.

### After each chunk:

- Merge the branch.
- Validate the chunk against the user journey it maps to.
- Move to the next chunk.

---

## Deployment and Post-Launch

**Before deploying:**

- Run the app against the load numbers from the system design step. Don't guess whether it handles the expected concurrency — test it. Ask Claude to help write a basic load test.
- Have a rollback plan. Know how to revert to the previous version if something breaks. Feature flags (turning features on/off without redeploying) are the cleanest approach, but at minimum, keep the previous deployment artifact so you can redeploy it.

**After deploying Phase 1:**

- Monitor error rates, response times, and user-reported issues for a defined watch period (e.g., 48-72 hours) before starting Phase 2 work.
- Bugs and feedback from this period get triaged: critical fixes go immediately, everything else gets logged and evaluated against Phase 2 scope.

**Phase 2 and beyond:**

- Same cycle: update PRD scope → update ERD → chunk → build → deploy.

---

## Summary of the Sequence

```
PRD + User Journeys (first draft, with phase distribution)
        ↓
Frontend Prototype  ←→  Crux Identification
   (parallel — both feed back into PRD)
        ↓
PRD Locked (incorporates prototype feedback + crux findings)
        ↓
System Design
  → Load parameters
  → Architecture decisions
  → Database design
  → API design
  → Resilience and failure handling
  → Observability
  → Security baseline
  → Architecture diagram
        ↓
Engineering Requirement Document (assembles all of the above)
        ↓
Implementation (chunk by chunk: extract chunk scope doc from ERD → backend APIs → integrate with frontend)
        ↓
Deployment + Post-Launch Monitoring
        ↓
Next Phase (repeat the cycle)
```
