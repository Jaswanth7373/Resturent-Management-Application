// Load environment variables first
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
const { seed } = require('./db');

seed();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post('/api/assistant/chat', async (req, res) => {
  try {
    const { message, context, payload } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: 'AI assistant is not configured. Set GEMINI_API_KEY in your environment.' });
    }

    const prompt = `You are The Copper Fork assistant embedded in the restaurant platform.
Current page: ${context?.pageLabel || 'unknown'}
Active tab: ${context?.tabLabel || 'unknown'}
User role: ${context?.role || 'guest'}
Live context: ${JSON.stringify(payload || {})}

Answer the user's question directly, briefly, and helpfully. Keep it focused on the current page and its role. If there is live data, use it. If not, answer based on the page context.`;

    const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${prompt}\n\nUser question: ${message}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
      })
    });

    const data = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) {
      return res.status(502).json({ error: data?.error?.message || 'Assistant service unavailable' });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate an answer right now.';
    res.json({ reply });
  } catch (error) {
    console.error('Assistant chat error', error);
    res.status(500).json({ error: 'Assistant chat failed' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Socket: clients join a room per branch to get scoped real-time updates
io.on('connection', (socket) => {
  socket.on('join', ({ branchId }) => {
    if (branchId) socket.join(`branch:${branchId}`);
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/restaurants', require('./routes/restaurants')());
app.use('/api/menu', require('./routes/menu')(io));
app.use('/api/tables', require('./routes/tables')(io));
app.use('/api/orders', require('./routes/orders')(io));
app.use('/api/reservations', require('./routes/reservations')(io));
app.use('/api/reports', require('./routes/reports')(io));
app.use('/api/inventory', require('./routes/inventory')(io));
app.use('/api/favorites', require('./routes/favorites')());
app.use('/api/reviews', require('./routes/reviews')(io));
app.use('/api/coupons', require('./routes/coupons')(io));
app.use('/api/superadmin', require('./routes/superadmin')(io));
app.use('/api/payments', require('./routes/payments')(io));
app.use('/api/analytics', require('./routes/analytics')());
app.use('/api/branches', require('./routes/branches')());
app.use('/api/attendance', require('./routes/attendance')(io));
app.use('/api/staff', require('./routes/staff')());

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Catch-all JSON error handler: anything a route throws synchronously (e.g. validation
// errors like "Invalid menu item" or "Only 3 left today") lands here as clean JSON
// instead of Express's default HTML error page, which the frontend can't parse.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 400).json({ error: err.message || 'Something went wrong' });
});

const PORT = process.env.PORT || 3000;

// Test database connection before starting server
(async () => {
  try {
    if (process.env.USE_SUPABASE === 'true') {
      const { testConnection } = require('./supabase');
      await testConnection();
    } else {
      console.log('✅ Using local database (lowdb)');
    }
  } catch (err) {
    console.warn('⚠️  Database connection warning:', err.message);
  }

  server.listen(PORT, () => {
    console.log(`\n🍽  Restaurant platform running at http://localhost:${PORT}`);
    console.log(`   Login page: http://localhost:${PORT}/index.html\n`);
    if (process.env.USE_SUPABASE === 'true') {
      console.log('📊 Database: Supabase (Cloud PostgreSQL)');
    } else {
      console.log('📊 Database: lowdb (Local JSON)');
    }
  });
})();
