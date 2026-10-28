const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'youtube_clone',
  port: 5432
});

// Redis client
const redisClient = redis.createClient({
  host: 'localhost',
  port: 6379
});

// Connect to Redis
redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected');
});

(async () => {
  await redisClient.connect();
})();

// Track cache stats
let cacheHits = 0;
let cacheMisses = 0;

app.use(express.json());

// ===== HEALTH CHECK ENDPOINTS =====

// 1. LIVENESS PROBE: Is the server alive?
app.get('/health/live', (req, res) => {
  // Simple check: Is the process running?
  // If this endpoint responds, server is alive
  res.json({
    status: 'alive',
    port: PORT,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 2. READINESS PROBE: Is the server ready to serve traffic?
app.get('/health/ready', async (req, res) => {
  try {
    // Check 1: Can we connect to PostgreSQL?
    await pool.query('SELECT 1');
    const dbConnected = true;

    // Check 2: Can we connect to Redis?
    const redisPing = await redisClient.ping();
    const cacheConnected = redisPing === 'PONG';

    // All checks passed
    if (dbConnected && cacheConnected) {
      return res.json({
        status: 'ready',
        database: 'connected',
        cache: 'connected',
        port: PORT,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    // One or more checks failed
    return res.status(503).json({
      status: 'not_ready',
      error: error.message,
      port: PORT,
      timestamp: new Date().toISOString()
    });
  }
});

// 3. DEEP HEALTH CHECK: Full system status
app.get('/health/deep', async (req, res) => {
  try {
    // Check database
    const dbResult = await pool.query('SELECT 1');
    const dbConnected = dbResult.rows.length > 0;

    // Check cache
    const redisPing = await redisClient.ping();
    const cacheConnected = redisPing === 'PONG';

    // Get cache stats
    const cacheStats = {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: cacheMisses + cacheHits > 0 
        ? ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(2) + '%'
        : '0%'
    };

    // Get uptime
    const uptimeSeconds = process.uptime();
    const uptimeMinutes = (uptimeSeconds / 60).toFixed(2);

    return res.json({
      status: 'healthy',
      server: {
        port: PORT,
        uptime_seconds: uptimeSeconds,
        uptime_minutes: uptimeMinutes,
        timestamp: new Date().toISOString()
      },
      dependencies: {
        database: dbConnected ? 'connected' : 'disconnected',
        cache: cacheConnected ? 'connected' : 'disconnected'
      },
      metrics: {
        cache_hits: cacheHits,
        cache_misses: cacheMisses,
        cache_hit_rate: cacheStats.hitRate
      }
    });
  } catch (error) {
    return res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      port: PORT,
      timestamp: new Date().toISOString()
    });
  }
});

// 4. SIMPLE HEALTH (backward compatibility)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});


// Hello endpoint
app.get('/api/hello', (req, res) => {
  res.json({
    message: 'Hello from server!',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// ===== CACHED ENDPOINT: Get all users =====
app.get('/api/users', async (req, res) => {
  const cacheKey = 'all_users';
  
  try {
    // Step 1: Check Redis cache
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      // CACHE HIT
      cacheHits++;
      console.log(`✓ Cache HIT for ${cacheKey} (${cacheHits} total hits)`);
      return res.json({
        users: JSON.parse(cachedData),
        count: JSON.parse(cachedData).length,
        cached: true,
        cacheHits: cacheHits,
        cacheMisses: cacheMisses,
        server_port: PORT
      });
    }
    
    // CACHE MISS: Query database
    cacheMisses++;
    console.log(`✗ Cache MISS for ${cacheKey} (${cacheMisses} total misses)`);
    
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    
    // Cache the result for 60 seconds
    await redisClient.setEx(
      cacheKey,
      60,  // TTL: 60 seconds
      JSON.stringify(result.rows)
    );
    
    console.log(`  → Cached users in Redis (TTL: 60s)`);
    
    res.json({
      users: result.rows,
      count: result.rows.length,
      cached: false,
      cacheHits: cacheHits,
      cacheMisses: cacheMisses,
      server_port: PORT
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      server_port: PORT
    });
  }
});

// ===== CREATE USER (WITH CACHE INVALIDATION) =====
app.post('/api/users', async (req, res) => {
  const { name, email } = req.body;
  const cacheKey = 'all_users';
  
  try {
    // Step 1: Insert into database
    const result = await pool.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );
    
    // Step 2: INVALIDATE cache (delete the cached key)
    await redisClient.del(cacheKey);
    console.log(`🔄 Cache INVALIDATED for ${cacheKey}`);
    
    res.json({
      message: 'User created',
      user: result.rows[0],
      cacheInvalidated: true,
      server_port: PORT
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      server_port: PORT
    });
  }
});

// ===== GET USER BY EMAIL (CACHED) =====
app.get('/api/users/:email', async (req, res) => {
  const { email } = req.params;
  const cacheKey = `user:${email}`;
  
  try {
    // Check cache
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      cacheHits++;
      return res.json({
        user: JSON.parse(cachedData),
        cached: true,
        server_port: PORT
      });
    }
    
    // Cache miss - query database
    cacheMisses++;
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        server_port: PORT
      });
    }
    
    // Cache for 60 seconds
    await redisClient.setEx(
      cacheKey,
      60,
      JSON.stringify(result.rows[0])
    );
    
    res.json({
      user: result.rows[0],
      cached: false,
      server_port: PORT
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      server_port: PORT
    });
  }
});

// ===== CACHE STATS ENDPOINT =====
app.get('/api/cache-stats', (req, res) => {
  const total = cacheHits + cacheMisses;
  const hitRate = total > 0 ? ((cacheHits / total) * 100).toFixed(2) : 0;
  
  res.json({
    cacheHits,
    cacheMisses,
    total,
    hitRate: `${hitRate}%`,
    server_port: PORT
  });
});

// ===== CLEAR CACHE ENDPOINT (for testing) =====
app.post('/api/cache-clear', async (req, res) => {
  try {
    await redisClient.flushDb();
    cacheHits = 0;
    cacheMisses = 0;
    console.log('🗑️  Cache CLEARED');
    res.json({
      message: 'Cache cleared',
      server_port: PORT
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      server_port: PORT
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📡 Redis: Connected to localhost:6379`);
  console.log(`📊 Cache Stats: GET http://localhost:${PORT}/api/cache-stats`);
});