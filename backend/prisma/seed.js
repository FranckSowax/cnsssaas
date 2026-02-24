const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ============================================
  // 1. Utilisateur Admin
  // ============================================
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cnsssaas.ga' },
    update: {},
    create: {
      email: 'admin@cnsssaas.ga',
      password: adminPassword,
      name: 'Admin CNSS',
      role: 'ADMIN',
      isActive: true
    }
  });
  console.log(`Admin créé: ${admin.email}`);

  // Utilisateur opérateur
  const operatorPassword = await bcrypt.hash('operator123', 10);
  const operator = await prisma.user.upsert({
    where: { email: 'operator@cnsssaas.ga' },
    update: {},
    create: {
      email: 'operator@cnsssaas.ga',
      password: operatorPassword,
      name: 'Opérateur Test',
      role: 'OPERATOR',
      isActive: true
    }
  });
  console.log(`Opérateur créé: ${operator.email}`);

  // ============================================
  // 2. Templates WhatsApp
  // ============================================
  const templates = await Promise.all([
    prisma.template.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'welcome_message',
        displayName: 'Message de Bienvenue',
        category: 'UTILITY',
        content: 'Bonjour {{1}} ! Bienvenue à la CNSS. Votre compte est actif.',
        variables: ['nom'],
        language: 'fr',
        status: 'APPROVED',
        approvedAt: new Date()
      }
    }),
    prisma.template.upsert({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'reactivation_app',
        displayName: 'Relance Application Mobile',
        category: 'MARKETING',
        content: 'Bonjour {{1}}, votre application CNSS vous attend ! Reconnectez-vous : {{2}}',
        variables: ['nom', 'lien'],
        language: 'fr',
        status: 'APPROVED',
        approvedAt: new Date()
      }
    }),
    prisma.template.upsert({
      where: { id: '00000000-0000-0000-0000-000000000003' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'otp_verification',
        displayName: 'Code OTP',
        category: 'AUTHENTICATION',
        content: 'Votre code de vérification CNSS est : {{1}}. Valable 5 minutes.',
        variables: ['code'],
        language: 'fr',
        status: 'APPROVED',
        approvedAt: new Date()
      }
    })
  ]);
  console.log(`${templates.length} templates créés`);

  // ============================================
  // 3. Contacts de test (enrichis CNSS)
  // ============================================
  const contacts = [
    { phone: '+24174000001', name: 'Jean Dupont', email: 'jean.dupont@email.com', category: 'ACTIVE', tags: ['app-mobile', 'cotisant'], optedIn: true, city: 'Libreville', country: 'GA', ageRange: '36-45', gender: 'M', memberType: 'SALARIE', engagementScore: 85 },
    { phone: '+24174000002', name: 'Marie Ndong', email: 'marie.ndong@email.com', category: 'ACTIVE', tags: ['app-mobile'], optedIn: true, city: 'Libreville', country: 'GA', ageRange: '26-35', gender: 'F', memberType: 'RETRAITE', engagementScore: 72 },
    { phone: '+24174000003', name: 'Paul Mba', email: 'paul.mba@email.com', category: 'INACTIVE', tags: ['ancien-assure'], optedIn: true, city: 'Port-Gentil', country: 'GA', ageRange: '46-55', gender: 'M', memberType: 'SALARIE', engagementScore: 15 },
    { phone: '+24174000004', name: 'Aline Obame', email: 'aline.obame@email.com', category: 'COTISANT', tags: ['cotisant', 'app-mobile'], optedIn: true, city: 'Libreville', country: 'GA', ageRange: '36-45', gender: 'F', memberType: 'INDEPENDANT', engagementScore: 95 },
    { phone: '+24174000005', name: 'Marc Essono', email: 'marc.essono@email.com', category: 'NEW', tags: ['nouveau'], optedIn: true, city: 'Franceville', country: 'GA', ageRange: '18-25', gender: 'M', memberType: 'AYANT_DROIT', engagementScore: 40 },
    { phone: '+24174000006', name: 'Sophie Nguema', email: 'sophie.nguema@email.com', category: 'ACTIVE', tags: ['app-mobile'], optedIn: false, city: 'Libreville', country: 'GA', ageRange: '26-35', gender: 'F', memberType: 'RETRAITE', engagementScore: 60 },
    { phone: '+24174000007', name: 'David Ondo', email: 'david.ondo@email.com', category: 'INACTIVE', tags: [], optedIn: true, city: 'Oyem', country: 'GA', ageRange: '56+', gender: 'M', memberType: 'SALARIE', engagementScore: 5 },
    { phone: '+24174000008', name: 'Claire Bongo', email: 'claire.bongo@email.com', category: 'BENEFICIAIRE', tags: ['beneficiaire', 'cotisant'], optedIn: true, city: 'Libreville', country: 'GA', ageRange: '46-55', gender: 'F', memberType: 'INDEPENDANT', engagementScore: 98 },
    { phone: '+24174000009', name: 'Pierre Ella', email: 'pierre.ella@email.com', category: 'ACTIVE', tags: ['app-mobile'], optedIn: true, city: 'Lambaréné', country: 'GA', ageRange: '26-35', gender: 'M', memberType: 'SALARIE', engagementScore: 55 },
    { phone: '+24174000010', name: 'Fatou Diallo', email: 'fatou.diallo@email.com', category: 'ACTIVE', tags: ['app-mobile', 'cotisant'], optedIn: true, city: 'Libreville', country: 'GA', ageRange: '36-45', gender: 'F', memberType: 'RETRAITE', engagementScore: 78 }
  ];

  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: { phone: contact.phone },
      update: {
        category: contact.category,
        city: contact.city,
        country: contact.country,
        ageRange: contact.ageRange,
        gender: contact.gender,
        memberType: contact.memberType,
        engagementScore: contact.engagementScore
      },
      create: {
        ...contact,
        language: 'fr',
        registrationDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        optedInAt: contact.optedIn ? new Date() : null,
        lastActivity: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      }
    });
  }
  console.log(`${contacts.length} contacts créés`);

  // ============================================
  // 4. Segments dynamiques
  // ============================================
  const segments = [
    {
      id: '00000000-0000-0000-0000-000000000020',
      name: 'assures_actifs_libreville',
      description: 'Assurés actifs basés à Libreville',
      type: 'DYNAMIC',
      criteria: {
        operator: 'AND',
        rules: [
          { field: 'city', op: 'eq', value: 'Libreville' },
          { field: 'category', op: 'eq', value: 'ACTIVE' }
        ]
      },
      contactCount: 0,
      createdBy: admin.id
    },
    {
      id: '00000000-0000-0000-0000-000000000021',
      name: 'assures_cotisants',
      description: 'Assurés cotisants actifs à fort engagement',
      type: 'SOCIAL_CRITERIA',
      criteria: {
        operator: 'AND',
        rules: [
          { field: 'category', op: 'in', value: ['COTISANT', 'BENEFICIAIRE'] },
          { field: 'engagementScore', op: 'gte', value: 80 }
        ]
      },
      contactCount: 0,
      createdBy: admin.id
    },
    {
      id: '00000000-0000-0000-0000-000000000022',
      name: 'nouveaux_inscrits_30j',
      description: 'Contacts inscrits dans les 30 derniers jours',
      type: 'DYNAMIC',
      criteria: {
        operator: 'AND',
        rules: [
          { field: 'category', op: 'eq', value: 'NEW' }
        ]
      },
      contactCount: 0,
      createdBy: admin.id
    }
  ];

  for (const seg of segments) {
    await prisma.segment.upsert({
      where: { id: seg.id },
      update: { criteria: seg.criteria, description: seg.description },
      create: seg
    });
  }
  console.log(`${segments.length} segments créés`);

  // ============================================
  // 5. Campagne de test
  // ============================================
  const campaign = await prisma.campaign.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Campagne Test - Relance App',
      type: 'REACTIVATION',
      status: 'DRAFT',
      templateId: '00000000-0000-0000-0000-000000000002',
      legacySegment: 'ACTIVE',
      variables: { var1: 'nom', var2: 'https://cnsssaas.ga/app' },
      createdBy: admin.id
    }
  });
  console.log(`Campagne créée: ${campaign.name}`);

  // ============================================
  // 6. API Key de test
  // ============================================
  const apiKey = await prisma.apiKey.upsert({
    where: { key: 'cnss-test-api-key-2026' },
    update: {},
    create: {
      name: 'Test API Key',
      key: 'cnss-test-api-key-2026',
      permissions: ['campaign:create', 'campaign:read', 'campaign:send', 'contact:create', 'contact:read', 'template:read'],
      isActive: true,
      createdBy: admin.id
    }
  });
  console.log(`API Key créée: ${apiKey.name}`);

  console.log('\nSeed terminé !');
  console.log('=====================================');
  console.log('Comptes de test:');
  console.log('  Admin:    admin@cnsssaas.ga / admin123');
  console.log('  Operator: operator@cnsssaas.ga / operator123');
  console.log('=====================================');
}

main()
  .catch((e) => {
    console.error('Erreur seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
