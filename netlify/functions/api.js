// Charger les variables d'environnement
require('dotenv').config();

// Forcer le mode serverless (pas de Redis)
process.env.REDIS_ENABLED = process.env.REDIS_ENABLED || 'false';

const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// Import routes
const authRoutes = require('../../backend/src/routes/auth');
const campaignRoutes = require('../../backend/src/routes/campaigns');
const contactRoutes = require('../../backend/src/routes/contacts');
const templateRoutes = require('../../backend/src/routes/templates');
const chatbotRoutes = require('../../backend/src/routes/chatbot');
const analyticsRoutes = require('../../backend/src/routes/analytics');
const webhookRoutes = require('../../backend/src/routes/webhooks');
const { errorHandler } = require('../../backend/src/middleware/errorHandler');
const { apiLimiter } = require('../../backend/src/middleware/rateLimit');

const app = express();

// Trust proxy (required behind Netlify CDN for express-rate-limit)
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api/', apiLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: 'netlify-functions',
    version: '1.0.0',
    services: {
      database: !!process.env.DATABASE_URL,
      whatsapp: !!process.env.WHATSAPP_ACCESS_TOKEN,
      openai: !!process.env.OPENAI_API_KEY,
      supabase: !!process.env.SUPABASE_URL,
      redis: process.env.REDIS_ENABLED !== 'false' && !!process.env.REDIS_HOST
    }
  });
});

// Temporary: Test WhatsApp Cloud API connectivity
app.get('/api/debug/whatsapp-test', async (req, res) => {
  try {
    const whatsappService = require('../../backend/src/services/whatsapp');
    res.json({
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? '✓ configured' : '✗ missing',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ? '✓ configured (' + process.env.WHATSAPP_ACCESS_TOKEN.slice(0, 10) + '...)' : '✗ missing',
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ? '✓ configured' : '✗ missing',
      appSecret: process.env.WHATSAPP_APP_SECRET ? '✓ configured' : '✗ missing',
      wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ? '✓ configured' : '✗ missing'
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.post('/api/debug/whatsapp-send', async (req, res) => {
  try {
    const whatsappService = require('../../backend/src/services/whatsapp');
    const { phone, message } = req.body;
    const result = await whatsappService.sendMessage(phone, message || 'Test depuis BGFI WhatsApp SaaS - WhatsApp Cloud API');
    res.json(result);
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhooks', webhookRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée', path: req.path });
});

// Export for Netlify Functions
module.exports.handler = serverless(app, {
  basePath: '/.netlify/functions/api'
});
