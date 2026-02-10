const express = require('express');
const router = express.Router();
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const prisma = new PrismaClient();
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8000';

// ============================================
// POST /api/chatbot/message - Envoyer un message
// ============================================
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId, contactId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message requis' });
    }

    // Appeler le service RAG
    const response = await axios.post(`${RAG_SERVICE_URL}/chat`, {
      message,
      session_id: sessionId,
      contact_id: contactId
    });

    // Sauvegarder la session si contactId est fourni
    if (contactId) {
      // Mettre à jour ou créer la session
      await prisma.chatSession.upsert({
        where: { id: sessionId || 'new' },
        update: {
          messages: {
            push: [
              { role: 'user', content: message, timestamp: new Date() },
              { role: 'bot', content: response.data.response, timestamp: new Date() }
            ]
          }
        },
        create: {
          contactId,
          messages: [
            { role: 'user', content: message, timestamp: new Date() },
            { role: 'bot', content: response.data.response, timestamp: new Date() }
          ]
        }
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error('Error in chatbot message', { 
      error: error.message,
      message: req.body.message?.substring(0, 50)
    });
    
    res.status(500).json({ 
      error: 'Erreur lors du traitement du message',
      response: 'Désolé, une erreur est survenue. Veuillez réessayer ou contacter le service client au 0770 12 34 56.'
    });
  }
});

// ============================================
// GET /api/chatbot/knowledge - Lister les documents
// ============================================
router.get('/knowledge', authenticate, async (req, res) => {
  try {
    const response = await axios.get(`${RAG_SERVICE_URL}/documents`);
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching knowledge documents', { error: error.message });
    res.status(500).json({ error: 'Erreur lors de la récupération des documents' });
  }
});

// ============================================
// POST /api/chatbot/knowledge/upload - Uploader un document
// ============================================
router.post('/knowledge/upload', authenticate, async (req, res) => {
  try {
    // Forward to RAG service
    // Note: In production, use multipart upload
    res.json({ 
      message: 'Upload démarré',
      note: 'Utilisez le service RAG directement pour l\'upload de documents'
    });
  } catch (error) {
    logger.error('Error uploading document', { error: error.message });
    res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
});

// ============================================
// DELETE /api/chatbot/knowledge/:id - Supprimer un document
// ============================================
router.delete('/knowledge/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    await axios.delete(`${RAG_SERVICE_URL}/documents/${id}`);
    
    logger.info('Knowledge document deleted', { docId: id, userId: req.user.id });
    
    res.json({ success: true, message: 'Document supprimé' });
  } catch (error) {
    logger.error('Error deleting document', { error: error.message, docId: req.params.id });
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// ============================================
// GET /api/chatbot/status - Statut du chatbot (env vars)
// ============================================
router.get('/status', authenticate, async (req, res) => {
  try {
    const autoReply = process.env.CHATBOT_AUTO_REPLY !== 'false';
    const ragUrl = process.env.RAG_SERVICE_URL;
    const openaiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4';
    const systemPrompt = process.env.CHATBOT_SYSTEM_PROMPT ||
      "Tu es Cassiopee, l'assistant virtuel de BGFI Bank Gabon sur WhatsApp...";
    const fallbackMessage = process.env.CHATBOT_FALLBACK_MESSAGE ||
      'Merci pour votre message. Un conseiller BGFI Bank vous repondra dans les plus brefs delais. Service client : 011 76 32 29';

    // Check RAG service connectivity
    let ragStatus = 'not_configured';
    if (ragUrl) {
      try {
        await axios.get(`${ragUrl}/health`, { timeout: 5000 });
        ragStatus = 'connected';
      } catch {
        ragStatus = 'unreachable';
      }
    }

    // Count recent sessions (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSessions = await prisma.chatSession.count({
      where: { createdAt: { gte: oneDayAgo } }
    }).catch(() => 0);

    res.json({
      enabled: autoReply,
      ragService: {
        configured: !!ragUrl,
        status: ragStatus,
        url: ragUrl ? ragUrl.replace(/\/\/(.+?)@/, '//*****@') : null
      },
      openai: {
        configured: !!openaiKey,
        model
      },
      systemPromptPreview: systemPrompt.substring(0, 150) + (systemPrompt.length > 150 ? '...' : ''),
      fallbackMessage,
      recentSessions
    });
  } catch (error) {
    logger.error('Error fetching chatbot status', { error: error.message });
    res.status(500).json({ error: 'Erreur lors de la recuperation du statut' });
  }
});

// ============================================
// GET /api/chatbot/config - Configuration RAG
// ============================================
router.get('/config', authenticate, async (req, res) => {
  try {
    const response = await axios.get(`${RAG_SERVICE_URL}/config`);
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching RAG config', { error: error.message });
    res.status(500).json({ error: 'Erreur lors de la récupération de la configuration' });
  }
});

// ============================================
// POST /api/chatbot/config - Mettre à jour la config
// ============================================
router.post('/config', authenticate, async (req, res) => {
  try {
    const config = req.body;
    
    const response = await axios.post(`${RAG_SERVICE_URL}/config`, config);
    
    logger.info('RAG config updated', { userId: req.user.id, config });
    
    res.json(response.data);
  } catch (error) {
    logger.error('Error updating RAG config', { error: error.message });
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// ============================================
// GET /api/chatbot/stats - Statistiques RAG
// ============================================
router.get('/stats', authenticate, async (req, res) => {
  try {
    const response = await axios.get(`${RAG_SERVICE_URL}/stats`);
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching RAG stats', { error: error.message });
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
});

// ============================================
// GET /api/chatbot/sessions - Sessions de chat
// ============================================
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [sessions, total] = await Promise.all([
      prisma.chatSession.findMany({
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              phone: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.chatSession.count()
    ]);

    res.json({
      data: sessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching chat sessions', { error: error.message });
    res.status(500).json({ error: 'Erreur lors de la récupération des sessions' });
  }
});

module.exports = router;
