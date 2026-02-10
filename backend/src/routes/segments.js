const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const { authenticate, authorize } = require('../middleware/auth');
const { evaluateCount, evaluateContacts, buildWhereClause, ALLOWED_FIELDS } = require('../services/segmentEvaluator');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

// ============================================
// GET /api/segments - Lister les segments
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (type) where.type = type.toUpperCase();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [segments, total] = await Promise.all([
      prisma.segment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.segment.count({ where })
    ]);

    res.json({
      data: segments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching segments', { error: error.message });
    res.status(500).json({ error: 'Erreur lors de la récupération des segments' });
  }
});

// ============================================
// GET /api/segments/fields - Champs disponibles pour le builder
// ============================================
router.get('/fields', authenticate, (req, res) => {
  const fields = [
    { name: 'category', label: 'Catégorie', type: 'select', group: 'PROFIL', options: ['ALL', 'ACTIVE', 'INACTIVE', 'NEW', 'PREMIUM', 'VIP'] },
    { name: 'city', label: 'Ville', type: 'text', group: 'PROFIL' },
    { name: 'country', label: 'Pays', type: 'text', group: 'PROFIL' },
    { name: 'ageRange', label: "Tranche d'âge", type: 'select', group: 'PROFIL', options: ['18-25', '26-35', '36-45', '46-55', '56+'] },
    { name: 'gender', label: 'Genre', type: 'select', group: 'PROFIL', options: ['M', 'F', 'AUTRE'] },
    { name: 'language', label: 'Langue', type: 'select', group: 'PROFIL', options: ['fr', 'en', 'es'] },
    { name: 'status', label: 'Statut', type: 'select', group: 'PROFIL', options: ['ACTIVE', 'UNSUBSCRIBED', 'BLOCKED'] },
    { name: 'accountType', label: 'Type de compte', type: 'select', group: 'BANQUE', options: ['EPARGNE', 'COURANT', 'PROFESSIONNEL', 'JEUNE'] },
    { name: 'registrationDate', label: "Date d'inscription", type: 'date', group: 'BANQUE' },
    { name: 'engagementScore', label: "Score d'engagement", type: 'number', group: 'COMPORTEMENT' },
    { name: 'lastActivity', label: 'Dernière activité', type: 'date', group: 'COMPORTEMENT' },
    { name: 'lastCampaignInteraction', label: 'Dernière interaction campagne', type: 'date', group: 'COMPORTEMENT' },
    { name: 'tags', label: 'Tags', type: 'text', group: 'PROFIL' },
    { name: 'optedIn', label: 'Opt-in WhatsApp', type: 'boolean', group: 'PROFIL' }
  ];
  res.json({ fields });
});

// ============================================
// GET /api/segments/:id - Détail d'un segment
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const segment = await prisma.segment.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { campaigns: true } }
      }
    });

    if (!segment) {
      return res.status(404).json({ error: 'Segment non trouvé' });
    }

    res.json(segment);
  } catch (error) {
    logger.error('Error fetching segment', { error: error.message });
    res.status(500).json({ error: 'Erreur lors de la récupération du segment' });
  }
});

// ============================================
// POST /api/segments - Créer un segment
// ============================================
router.post('/', authenticate, authorize(['campaign:create']), async (req, res) => {
  try {
    const { name, description, type, criteria } = req.body;

    if (!name || !criteria) {
      return res.status(400).json({ error: 'Données manquantes', required: ['name', 'criteria'] });
    }

    // Validate criteria by building where clause
    buildWhereClause(criteria);

    // Evaluate contact count
    const contactCount = await evaluateCount(prisma, criteria);

    const segment = await prisma.segment.create({
      data: {
        name: name.toLowerCase().replace(/\s+/g, '_'),
        description,
        type: (type || 'DYNAMIC').toUpperCase(),
        criteria,
        contactCount,
        lastEvaluatedAt: new Date(),
        createdBy: req.user.id
      }
    });

    logger.info('Segment created', { segmentId: segment.id, userId: req.user.id, contactCount });
    res.status(201).json(segment);
  } catch (error) {
    logger.error('Error creating segment', { error: error.message });
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Un segment avec ce nom existe déjà' });
    }
    res.status(500).json({ error: error.message || 'Erreur lors de la création du segment' });
  }
});

// ============================================
// PUT /api/segments/:id - Modifier un segment
// ============================================
router.put('/:id', authenticate, authorize(['campaign:create']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, type, criteria } = req.body;

    const existing = await prisma.segment.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Segment non trouvé' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.toLowerCase().replace(/\s+/g, '_');
    if (description !== undefined) updateData.description = description;
    if (type !== undefined) updateData.type = type.toUpperCase();
    if (criteria !== undefined) {
      buildWhereClause(criteria);
      updateData.criteria = criteria;
      updateData.contactCount = await evaluateCount(prisma, criteria);
      updateData.lastEvaluatedAt = new Date();
    }

    const segment = await prisma.segment.update({ where: { id }, data: updateData });

    logger.info('Segment updated', { segmentId: id, userId: req.user.id });
    res.json(segment);
  } catch (error) {
    logger.error('Error updating segment', { error: error.message });
    res.status(500).json({ error: error.message || 'Erreur lors de la mise à jour du segment' });
  }
});

// ============================================
// DELETE /api/segments/:id - Supprimer un segment
// ============================================
router.delete('/:id', authenticate, authorize(['campaign:create']), async (req, res) => {
  try {
    const { id } = req.params;

    const segment = await prisma.segment.findUnique({
      where: { id },
      include: { _count: { select: { campaigns: true } } }
    });

    if (!segment) {
      return res.status(404).json({ error: 'Segment non trouvé' });
    }

    if (segment._count.campaigns > 0) {
      return res.status(400).json({
        error: 'Segment utilisé',
        message: `Ce segment est utilisé dans ${segment._count.campaigns} campagne(s) et ne peut pas être supprimé.`
      });
    }

    await prisma.segment.delete({ where: { id } });

    logger.info('Segment deleted', { segmentId: id, userId: req.user.id });
    res.json({ success: true, message: 'Segment supprimé' });
  } catch (error) {
    logger.error('Error deleting segment', { error: error.message });
    res.status(500).json({ error: 'Erreur lors de la suppression du segment' });
  }
});

// ============================================
// POST /api/segments/:id/evaluate - Réévaluer un segment
// ============================================
router.post('/:id/evaluate', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const segment = await prisma.segment.findUnique({ where: { id } });
    if (!segment) {
      return res.status(404).json({ error: 'Segment non trouvé' });
    }

    const contactCount = await evaluateCount(prisma, segment.criteria);

    await prisma.segment.update({
      where: { id },
      data: { contactCount, lastEvaluatedAt: new Date() }
    });

    res.json({ success: true, contactCount });
  } catch (error) {
    logger.error('Error evaluating segment', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST /api/segments/preview - Preview inline criteria (without saving)
// ============================================
router.post('/preview', authenticate, async (req, res) => {
  try {
    const { criteria } = req.body;

    if (!criteria) {
      return res.status(400).json({ error: 'Critères requis' });
    }

    const contactCount = await evaluateCount(prisma, criteria);
    const contacts = await evaluateContacts(prisma, criteria);

    // Return count + sample of first 5 contacts
    res.json({
      contactCount,
      sample: contacts.slice(0, 5).map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        city: c.city,
        accountType: c.accountType,
        engagementScore: c.engagementScore
      }))
    });
  } catch (error) {
    logger.error('Error previewing segment', { error: error.message });
    res.status(500).json({ error: error.message || 'Erreur lors de la prévisualisation' });
  }
});

module.exports = router;
