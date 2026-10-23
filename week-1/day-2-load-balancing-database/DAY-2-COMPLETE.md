# DAY 2: LOAD BALANCING + DATABASES (Complete)

## OVERVIEW
**Day 2:** Horizontal Scaling with NGINX Load Balancer + Persistent PostgreSQL Database
**Duration:** 6 hours (6:00 AM – 12:00 PM)
**Status:** ✅ COMPLETE

---

## PHASE 1: NGINX LOAD BALANCER BUILD (90 min)

### What is NGINX?
A reverse proxy that distributes incoming requests across multiple backend servers.

### Architecture Built

Client Requests
↓
NGINX Load Balancer (port 8080)
├→ Server 1 (port 3001)
├→ Server 2 (port 3002)
└→ Server 3 (port 3003)


### NGINX Configuration
- **File:** `nginx.conf`
- **Load Balancing Algorithm:** Round-robin with HTTP/1.1 connection management
- **Upstream Servers:** localhost:3001, localhost:3002, localhost:3003
- **Listening Port:** 8080

### Key Configuration Details
```nginx
upstream backend {
    server localhost:3001;
    server localhost:3002;
    server localhost:3003;
}

server {
    listen 8080;
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

### Tests Performed
1. ✅ Single request routing (verified round-robin pattern)
2. ✅ 9 sequential requests distribution (confirmed load spreading)
3. ✅ Server resilience (killed server 3001, requests routed to 3002/3003)
4. ✅ Server recovery (restarted 3001, automatically included in rotation)

### Observations
- Round-robin distribution: 2 requests per server (due to HTTP/1.1 connection pooling across NGINX workers)
- All servers receive traffic (no SPOF at app layer)
- Automatic failover when server dies
- Automatic recovery when server comes back online

### Learning Points
- Load balancer prevents SPOF at application layer
- Stateless servers can be killed/restarted without data loss
- Connection pooling in HTTP/1.1 can cause clustered distribution (normal behavior)
- The pattern matters less than actual load distribution across servers

---

## PHASE 2: DATABASE THEORY (90 min)

### Recall Questions & Answers

**Q1: Why do you need a database if you have servers?**
**Answer:** Servers are stateless. They don't store data. To persist data across server failures and share data between servers, you need a database.
**Score:** 5/5 ✅

**Q2: What's the difference between SQL and NoSQL?**
**Answer:** 
- SQL: Structured data in tables/rows/columns (PostgreSQL, MySQL, Oracle). ACID compliant. Hard to scale horizontally. Good for relational data.
- NoSQL: Unstructured JSON data (MongoDB, DynamoDB). Flexible schema. Easy horizontal scaling. Eventually consistent.
**Score:** 5/5 ✅

**Q3: What is ACID and why does it matter?**
**Answer:**
- **Atomicity:** All or nothing (fund transfer: both debit AND credit happen, or neither)
- **Consistency:** Data integrity rules enforced (email uniqueness)
- **Isolation:** Concurrent transactions don't interfere
- **Durability:** Data survives server/network crashes (written to disk)
**Score:** 5/5 ✅

**Q4: What is an index and why do databases use them?**
**Answer:** Index is a data structure that speeds up queries. Without index: scan all rows (O(n), slow). With index: pre-sorted lookup (O(log n), fast). Trade-off: slower writes, uses more disk.
**Score:** 4/5 ✅

**Q5: If your 3 servers don't have a database, what happens when a server crashes?**
**Answer:** Data is lost because it's stored in RAM (memory). When server dies, memory is wiped. No persistent storage = no data recovery.
**Score:** 5/5 ✅

### Deeper Understanding

**Deep Q1: Why PostgreSQL for YouTube?**
Because YouTube has relationships (users → videos → comments). SQL provides JOINs for efficient relationship queries. Structured schema prevents data inconsistency. ACID guarantees money doesn't disappear during transactions.

**Deep Q2: Should YouTube index email field?**
YES. YouTube has 500 queries/sec on email (without index = 1000 CPU-seconds wasted per second). Index overhead: 400ms insert time. Trade-off heavily favors indexing.

**Deep Q3: Why is ACID critical for monetization?**
Without ACID: Creator credited but advertiser NOT charged = money appears from nowhere. With ACID: Either ALL 4 steps succeed or NONE succeed. No inconsistent state.

**Deep Q4: Why SQL Joins instead of MongoDB?**
SQL: Single JOIN query gets user + videos + comments instantly. MongoDB: Manual fetch (users → videos → comments) = 1000x slower for relational queries.

**Deep Q5: Why YouTube uses BOTH SQL and NoSQL?**
- SQL (PostgreSQL): Users, Videos, Comments (need ACID, relationships, structured)
- NoSQL (MongoDB): Logs, Analytics, Preferences (need flexibility, easy sharding, high write throughput)

### Recall Score: 24/25 = 96%

---

## PHASE 3: POSTGRESQL BUILD (45 min)

### Database Setup
- **Database Name:** youtube_clone
- **User:** postgres
- **Host:** localhost
- **Port:** 5432
- **Authentication:** Trust (no password required)

### Users Table Schema
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Features
- ✅ Auto-incrementing ID
- ✅ Unique email constraint (prevents duplicates)
- ✅ Auto-timestamp on creation
- ✅ Persistent storage on disk

### Integration with Servers
Each server now has these endpoints:
- `POST /api/users` → Create user in database
- `GET /api/users` → Get all users
- `GET /api/users/:email` → Get specific user by email

### Node.js Pool Configuration
```javascript
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'youtube_clone',
  port: 5432
});
```

---

## PHASE 4: COMPLETE SYSTEM TESTS (30 min)

### Test 1: Create User Through Server 3001 (Direct)
```bash
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```
**Result:** ✅ User created with ID=1

### Test 2: Query From Server 3002 (Proves Data Sharing)
```bash
curl http://localhost:3002/api/users
```
**Result:** ✅ Server 3002 sees Alice (created by 3001)
**Learning:** All 3 servers share the SAME database!

### Test 3: Add Users Through NGINX Load Balancer
```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","email":"bob@example.com"}'
```
**Result:** ✅ 3 more users added (Bob, Charlie, Diana)

### Test 4: Query All Users
```bash
curl http://localhost:8080/api/users
```
**Result:** ✅ All 4 users retrieved, served from different servers (port shown varies)

### Test 5: Query Specific User by Email
```bash
curl http://localhost:8080/api/users/alice@example.com
```
**Result:** ✅ Alice found by email lookup

### Test 6: Kill Server 3001 (Prove Persistence)
- Killed server on port 3001
- Queried NGINX again
- **Result:** ✅ All 4 users still present (routed to 3002/3003)
- **Proof:** Data survived server death!

### Test 7: Restart Server 3001 (Prove Recovery)
- Restarted server 3001
- Queried NGINX again
- **Result:** ✅ All 4 users still present, 3001 back in rotation
- **Proof:** Server comes online and data is intact!

---

## FINAL ARCHITECTURE

┌─────────────────────────────────────────────────────────┐
│ YOUTUBE CLONE SYSTEM │
├─────────────────────────────────────────────────────────┤
│ │
│ User Requests │
│ ↓ │
│ NGINX Load Balancer (port 8080) │
│ ├→ /api/hello (round-robin) │
│ ├→ /api/users (CRUD operations) │
│ ↓ │
│ Server Layer (Stateless) │
│ ├→ Server 3001 (Express.js) │
│ ├→ Server 3002 (Express.js) │
│ └→ Server 3003 (Express.js) │
│ ↓ │
│ PostgreSQL 17 (Persistent Database) │
│ └─ users table (4 records: Alice, Bob, Charlie, Diana) │
│ │
└─────────────────────────────────────────────────────────┘

Data Flow:

Client sends request to NGINX on port 8080
NGINX routes to Server 3001, 3002, or 3003 (round-robin)
Server processes request
Server reads/writes to PostgreSQL database
Data persists on disk (survives server failures)
All 3 servers see same database (single source of truth)

---

## KEY CONCEPTS MASTERED

### 1. Horizontal Scaling
- Multiple identical servers instead of one big server
- Scale up/down without downtime
- No single point of failure at app layer

### 2. Load Balancing
- NGINX distributes traffic across servers
- Round-robin algorithm
- Automatic failover (dead servers removed)
- Automatic recovery (servers added back)

### 3. Stateless Architecture
- No data stored in server memory
- Servers are interchangeable
- Can kill/restart anytime
- Any server can handle any request

### 4. Persistence
- Data stored in database (not server memory)
- Data survives server crashes
- All servers share same data source
- Single source of truth

### 5. Databases
- **SQL:** Structured, ACID, relational (PostgreSQL, MySQL)
- **NoSQL:** Flexible, eventual consistency (MongoDB, DynamoDB)
- **ACID:** Atomicity, Consistency, Isolation, Durability
- **Indexes:** Speed up queries (trade-off: slower writes)

### 6. Resilience
- System handles server failures gracefully
- No data loss when servers die
- Automatic load balancing adjusts on failures
- System recovers when servers come back online

---

## SELF-ASSESSMENT

| Skill | Score | Evidence |
|-------|-------|----------|
| Understand Load Balancing | 5/5 | NGINX working, round-robin proven |
| Build NGINX Config | 5/5 | nginx.conf created, tested successfully |
| Understand SQL vs NoSQL | 5/5 | Deep questions answered correctly |
| Understand ACID | 5/5 | Explained all 4 properties with examples |
| Build Node.js + PostgreSQL | 5/5 | Servers connected to DB, CRUD working |
| Understand Persistence | 5/5 | Data survived server death |
| Understand Resilience | 5/5 | System recovered automatically |
| System Design Thinking | 5/5 | Identified SPOF, designed around it |

**Overall Score: 40/40 = 100%**

---

## TIME BREAKDOWN

6:00 AM – 7:30 AM (90 min): NGINX Load Balancer build
7:30–7:45 AM (15 min): Micro-break
7:45–9:15 AM (90 min): Databases theory + recall
9:15–9:30 AM (15 min): Micro-break
9:30–10:15 AM (45 min): PostgreSQL integration + build
10:15–11:00 AM (45 min): Testing + documentation (CURRENT)
────────────────────────────
Total: 6 hours ✅


---

## FILES CREATED

week-1/day-2-load-balancing-database/
├─ DAY-2-COMPLETE.md (this file)
├─ server.js (updated with database code)
├─ nginx.conf (load balancer config)
└─ package.json (with ‘pg’ dependency)


---

## WHAT'S NEXT (DAY 3+)

**Week 1 Plan:**
- Day 3: Caching (Redis)
- Day 4: Database optimization (Indexes, Sharding)
- Day 5: Reliability (Monitoring, Health checks)
- Day 6: Interview practice
- Day 7: Synthesis + Teaching guide

**This week:** Horizontal Scaling + Load Balancing + Persistence
**Next week:** AI/ML fundamentals + RAG systems

---

## PRINCIPAL ARCHITECT INSIGHTS

**What makes this architecture scalable:**

1. **Statelessness** → Can add/remove servers without affecting others
2. **Load Balancing** → Distributes traffic fairly, prevents bottleneck
3. **Persistence** → Data survives failures, enables recovery
4. **Fault Tolerance** → System continues when individual servers fail
5. **Single Source of Truth** → Database prevents inconsistency

**Real-world companies using this pattern:**
- YouTube: Thousands of servers behind load balancers, multiple databases
- Netflix: Microservices behind load balancers, NoSQL for scaling
- Twitter: Billions of tweets stored persistently, served through load balancers
- Amazon: Edge locations with load balancers, DynamoDB for persistence

---

## SIGNATURE

**Built on:** Oct 23, 2026
**Builder:** Bipin Kumar (20 years experience)
**Status:** Day 2 Complete ✅
**Next:** Day 3 - Caching with Redis

---
