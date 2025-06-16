import { PrismaClient, UserRole, ProviderTier } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create categories
  const categories = [
    { name: 'AC Service', description: 'Air conditioning repair and maintenance', icon: '❄️' },
    { name: 'Plumbing', description: 'Plumbing repairs and installations', icon: '🔧' },
    { name: 'Electrical', description: 'Electrical repairs and installations', icon: '⚡' },
    { name: 'Cleaning', description: 'House and office cleaning services', icon: '🧹' },
    { name: 'Handyman', description: 'General maintenance and repairs', icon: '🔨' },
    { name: 'Gardening', description: 'Garden maintenance and landscaping', icon: '🌿' },
    { name: 'Painting', description: 'Interior and exterior painting', icon: '🎨' },
    { name: 'Moving', description: 'Moving and relocation services', icon: '📦' },
    { name: 'Appliance Repair', description: 'Repair of household appliances', icon: '🔩' },
    { name: 'Pest Control', description: 'Pest control and extermination', icon: '🐛' }
  ];

  console.log('Creating categories...');
  const createdCategories = [];
  for (const category of categories) {
    const created = await prisma.category.upsert({
      where: { name: category.name },
      update: category,
      create: category
    });
    createdCategories.push(created);
  }

  // Create customers
  console.log('Creating customers...');
  const customers = [];
  for (let i = 1; i <= 10; i++) {
    const customer = await prisma.user.upsert({
      where: { email: `customer${i}@quickly.com` },
      update: {},
      create: {
        email: `customer${i}@quickly.com`,
        name: `Customer ${i}`,
        phone: `+65 9${String(i).padStart(3, '0')} ${String(i * 1234).slice(-4)}`,
        role: UserRole.CUSTOMER
      }
    });
    customers.push(customer);
  }

  // Create providers with realistic Singapore coordinates
  console.log('Creating providers...');
  const providers = [];
  const singaporeAreas = [
    { name: 'Orchard', lat: 1.3048, lon: 103.8318 },
    { name: 'Marina Bay', lat: 1.2835, lon: 103.8607 },
    { name: 'Sentosa', lat: 1.2494, lon: 103.8303 },
    { name: 'Jurong', lat: 1.3329, lon: 103.7436 },
    { name: 'Woodlands', lat: 1.4382, lon: 103.7890 },
    { name: 'Tampines', lat: 1.3496, lon: 103.9568 },
    { name: 'Bishan', lat: 1.3510, lon: 103.8487 },
    { name: 'Queenstown', lat: 1.2966, lon: 103.7764 },
    { name: 'Ang Mo Kio', lat: 1.3691, lon: 103.8454 },
    { name: 'Bedok', lat: 1.3236, lon: 103.9273 }
  ];

  for (let i = 1; i <= 30; i++) {
    const area = singaporeAreas[i % singaporeAreas.length];
    const completedJobs = Math.floor(Math.random() * 200) + 10;
    const totalRatings = Math.floor(completedJobs * 0.8); // 80% of jobs get rated
    const averageRating = 3.5 + Math.random() * 1.5; // 3.5 to 5.0

    const user = await prisma.user.upsert({
      where: { email: `provider${i}@quickly.com` },
      update: {},
      create: {
        email: `provider${i}@quickly.com`,
        name: `Provider ${i}`,
        phone: `+65 8${String(i).padStart(3, '0')} ${String(i * 5678).slice(-4)}`,
        role: UserRole.PROVIDER
      }
    });

    const tier = (averageRating >= 4.5 && completedJobs >= 50) ? ProviderTier.TIER_A : ProviderTier.TIER_B;

    const provider = await prisma.provider.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        latitude: area.lat + (Math.random() - 0.5) * 0.02, // Small random offset
        longitude: area.lon + (Math.random() - 0.5) * 0.02,
        completedJobs,
        averageRating: Math.round(averageRating * 10) / 10,
        totalRatings,
        tier,
        isAvailable: Math.random() > 0.3 // 70% available
      }
    });

    // Assign random categories to each provider (2-4 categories)
    const numCategories = Math.floor(Math.random() * 3) + 2;
    const shuffledCategories = [...createdCategories].sort(() => Math.random() - 0.5);
    
    for (let j = 0; j < numCategories; j++) {
      await prisma.providerCategory.upsert({
        where: {
          providerId_categoryId: {
            providerId: provider.id,
            categoryId: shuffledCategories[j].id
          }
        },
        update: {},
        create: {
          providerId: provider.id,
          categoryId: shuffledCategories[j].id
        }
      });
    }

    providers.push({ user, provider });
  }

  // Create historical jobs and price history
  console.log('Creating historical jobs and price history...');
  const jobTitles = {
    'AC Service': ['AC not cooling', 'AC making noise', 'AC service checkup', 'AC installation'],
    'Plumbing': ['Pipe leak repair', 'Toilet repair', 'Sink installation', 'Water heater repair'],
    'Electrical': ['Light fixture installation', 'Power outlet repair', 'Circuit breaker fix', 'Wiring inspection'],
    'Cleaning': ['House deep cleaning', 'Office cleaning', 'Post-renovation cleaning', 'Move-in cleaning'],
    'Handyman': ['Furniture assembly', 'Wall mounting', 'Door repair', 'General maintenance'],
    'Gardening': ['Lawn mowing', 'Tree pruning', 'Garden landscaping', 'Plant care'],
    'Painting': ['Room painting', 'Wall touch-up', 'Exterior painting', 'Furniture painting'],
    'Moving': ['House moving', 'Office relocation', 'Furniture moving', 'Packing service'],
    'Appliance Repair': ['Washing machine repair', 'Refrigerator fix', 'Oven repair', 'Microwave service'],
    'Pest Control': ['Cockroach control', 'Ant elimination', 'Termite treatment', 'General pest control']
  };

  for (let i = 0; i < 100; i++) {
    const category = createdCategories[Math.floor(Math.random() * createdCategories.length)];
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const providerData = providers[Math.floor(Math.random() * providers.length)];
    const area = singaporeAreas[Math.floor(Math.random() * singaporeAreas.length)];
    
    const titles = jobTitles[category.name] || ['General service'];
    const title = titles[Math.floor(Math.random() * titles.length)];
    
    // Generate realistic prices based on category
    const basePrices = {
      'AC Service': 80,
      'Plumbing': 120,
      'Electrical': 100,
      'Cleaning': 60,
      'Handyman': 70,
      'Gardening': 90,
      'Painting': 150,
      'Moving': 200,
      'Appliance Repair': 110,
      'Pest Control': 130
    };
    
    const basePrice = basePrices[category.name] || 100;
    const finalPrice = basePrice + (Math.random() - 0.5) * basePrice * 0.4; // ±20% variation
    
    const completedAt = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000); // Last 90 days
    
    await prisma.job.create({
      data: {
        customerId: customer.id,
        providerId: providerData.user.id,
        categoryId: category.id,
        title,
        description: `Professional ${title.toLowerCase()} service`,
        type: Math.random() > 0.7 ? 'QUICK_BOOK' : 'POST_QUOTE',
        status: 'COMPLETED',
        latitude: area.lat + (Math.random() - 0.5) * 0.02,
        longitude: area.lon + (Math.random() - 0.5) * 0.02,
        address: `${area.name} Area, Singapore`,
        finalPrice,
        completedAt
      }
    });

    // Add to price history
    await prisma.priceHistory.create({
      data: {
        categoryId: category.id,
        price: finalPrice,
        completedAt
      }
    });
  }

  console.log('✅ Seed completed successfully!');
  console.log(`Created:
  - ${createdCategories.length} categories
  - ${customers.length} customers  
  - ${providers.length} providers
  - 100 historical jobs with price data`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });