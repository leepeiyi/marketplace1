import { PrismaClient, UserRole, ProviderTier } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

const categories = [
  {
    name: "AC Service",
    description: "Air conditioning repair and maintenance",
    icon: "❄️",
  },
  {
    name: "Plumbing",
    description: "Plumbing repairs and installations",
    icon: "🔧",
  },
  {
    name: "Electrical",
    description: "Electrical repairs and installations",
    icon: "⚡",
  },
  {
    name: "Cleaning",
    description: "House and office cleaning services",
    icon: "🧹",
  },
  {
    name: "Handyman",
    description: "General maintenance and repairs",
    icon: "🔨",
  },
  {
    name: "Gardening",
    description: "Garden maintenance and landscaping",
    icon: "🌿",
  },
  {
    name: "Painting",
    description: "Interior and exterior painting",
    icon: "🎨",
  },
  { name: "Moving", description: "Moving and relocation services", icon: "📦" },
  {
    name: "Appliance Repair",
    description: "Repair of household appliances",
    icon: "🔩",
  },
  {
    name: "Pest Control",
    description: "Pest control and extermination",
    icon: "🐛",
  },
];

async function main() {
  console.log("🌱 Starting seed...");

  // Create categories
  console.log("Creating categories...");
  const createdCategories = [];
  for (const category of categories) {
    const created = await prisma.category.upsert({
      where: { name: category.name },
      update: category,
      create: category,
    });
    createdCategories.push(created);
  }

  // Helper function to get category by name
  const getCategoryByName = (name) => 
    createdCategories.find(cat => cat.name === name);

  // Create DEMO customers with fixed profiles
  console.log("Creating demo customers...");
  const demoCustomers = [
    {
      email: "customer1@quickly.com",
      name: "Alice Chen",
      phone: "+65 9123 4567",
      location: { lat: 1.3338, lon: 103.8701 }, // Punggol area
      address: "123 Punggol Drive, Singapore 820123"
    },
    {
      email: "customer2@quickly.com", 
      name: "Bob Tan",
      phone: "+65 9234 5678",
      location: { lat: 1.3048, lon: 103.8318 }, // Orchard area
      address: "456 Orchard Road, Singapore 238863"
    },
    {
      email: "customer3@quickly.com",
      name: "Carol Lim", 
      phone: "+65 9345 6789",
      location: { lat: 1.2835, lon: 103.8607 }, // Marina Bay area
      address: "789 Marina Bay Drive, Singapore 018956"
    }
  ];

  const customers = [];
  for (const customerData of demoCustomers) {
    const customer = await prisma.user.upsert({
      where: { email: customerData.email },
      update: {},
      create: {
        email: customerData.email,
        name: customerData.name,
        phone: customerData.phone,
        role: UserRole.CUSTOMER,
      },
    });
    customers.push({ ...customer, ...customerData });
  }

  // Create additional random customers
  for (let i = 4; i <= 10; i++) {
    const customer = await prisma.user.upsert({
      where: { email: `customer${i}@quickly.com` },
      update: {},
      create: {
        email: `customer${i}@quickly.com`,
        name: `Customer ${i}`,
        phone: `+65 9${String(i).padStart(3, "0")} ${String(i * 1234).slice(-4)}`,
        role: UserRole.CUSTOMER,
      },
    });
    customers.push(customer);
  }

  // Create DEMO providers with fixed profiles
  console.log("Creating demo providers...");
  const demoProviders = [
    {
      email: "provider1@quickly.com",
      name: "Expert Pro Services (Tier A)",
      phone: "+65 8123 4567",
      location: { lat: 1.3340, lon: 103.8705 }, // Very close to demo customer 1
      isAvailable: true,
      completedJobs: 85,
      averageRating: 4.8,
      totalRatings: 75,
      tier: ProviderTier.TIER_A,
      reliabilityScore: 95,
      categories: ["Painting", "Plumbing", "AC Service", "Electrical"]
    },
    {
      email: "provider2@quickly.com", 
      name: "Quick Fix Solutions (Tier B)",
      phone: "+65 8234 5678",
      location: { lat: 1.3335, lon: 103.8695 }, // Also close to demo customer 1
      isAvailable: true,
      completedJobs: 35, // Less than 50, so Tier B
      averageRating: 4.2, // Good but not Tier A level
      totalRatings: 28,
      tier: ProviderTier.TIER_B,
      reliabilityScore: 78,
      categories: ["Painting", "Plumbing", "AC Service", "Electrical"]
    },
    {
      email: "provider3@quickly.com",
      name: "Premium Home Services (Tier A)",
      phone: "+65 8345 6789", 
      location: { lat: 1.3050, lon: 103.8320 }, // Near Orchard (customer 2)
      isAvailable: true,
      completedJobs: 120,
      averageRating: 4.9,
      totalRatings: 95,
      tier: ProviderTier.TIER_A,
      reliabilityScore: 98,
      categories: ["Cleaning", "Handyman", "Gardening", "Moving"]
    }
  ];

  const providers = [];
  for (const providerData of demoProviders) {
    const user = await prisma.user.upsert({
      where: { email: providerData.email },
      update: {},
      create: {
        email: providerData.email,
        name: providerData.name,
        phone: providerData.phone,
        role: UserRole.PROVIDER,
      },
    });

    const provider = await prisma.provider.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        latitude: providerData.location.lat,
        longitude: providerData.location.lon,
        completedJobs: providerData.completedJobs,
        averageRating: providerData.averageRating,
        totalRatings: providerData.totalRatings,
        tier: providerData.tier,
        isAvailable: providerData.isAvailable,
        reliabilityScore: providerData.reliabilityScore,
      },
    });

    // Assign specific categories to demo providers
    for (const categoryName of providerData.categories) {
      const category = getCategoryByName(categoryName);
      if (category) {
        await prisma.providerCategory.upsert({
          where: {
            providerId_categoryId: {
              providerId: provider.id,
              categoryId: category.id,
            },
          },
          update: {},
          create: {
            providerId: provider.id,
            categoryId: category.id,
          },
        });
      }
    }

    providers.push({ user, provider, ...providerData });
  }

  // Create additional random providers
  const singaporeAreas = [
    { name: "Jurong", lat: 1.3329, lon: 103.7436 },
    { name: "Woodlands", lat: 1.4382, lon: 103.789 },
    { name: "Tampines", lat: 1.3496, lon: 103.9568 },
    { name: "Bishan", lat: 1.351, lon: 103.8487 },
    { name: "Queenstown", lat: 1.2966, lon: 103.7764 },
    { name: "Ang Mo Kio", lat: 1.3691, lon: 103.8454 },
    { name: "Bedok", lat: 1.3236, lon: 103.9273 },
  ];

  for (let i = 4; i <= 30; i++) {
    const area = singaporeAreas[(i - 4) % singaporeAreas.length];
    const completedJobs = Math.floor(Math.random() * 200) + 10;
    const averageRating = 3.5 + Math.random() * 1.5;
    const totalRatings = Math.floor(completedJobs * 0.8);
    const tier = averageRating >= 4.5 && completedJobs >= 50 
      ? ProviderTier.TIER_A 
      : ProviderTier.TIER_B;

    const user = await prisma.user.upsert({
      where: { email: `provider${i}@quickly.com` },
      update: {},
      create: {
        email: `provider${i}@quickly.com`,
        name: `Provider ${i}`,
        phone: `+65 8${String(i).padStart(3, "0")} ${String(i * 5678).slice(-4)}`,
        role: UserRole.PROVIDER,
      },
    });

    const provider = await prisma.provider.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        latitude: area.lat + (Math.random() - 0.5) * 0.002,
        longitude: area.lon + (Math.random() - 0.5) * 0.002,
        completedJobs,
        averageRating: Math.round(averageRating * 10) / 10,
        totalRatings,
        tier,
        isAvailable: Math.random() > 0.3,
        reliabilityScore: Math.floor(Math.random() * 30) + 70, // 70-100
      },
    });

    // Assign 2–4 random categories
    const numCategories = Math.floor(Math.random() * 3) + 2;
    const shuffledCategories = [...createdCategories].sort(() => Math.random() - 0.5);
    for (let j = 0; j < numCategories; j++) {
      await prisma.providerCategory.upsert({
        where: {
          providerId_categoryId: {
            providerId: provider.id,
            categoryId: shuffledCategories[j].id,
          },
        },
        update: {},
        create: {
          providerId: provider.id,
          categoryId: shuffledCategories[j].id,
        },
      });
    }

    providers.push({ user, provider });
  }

  // Historical jobs and price history
  console.log("Creating historical jobs and price history...");
  const jobTitles = {
    "AC Service": [
      "AC not cooling",
      "AC making noise", 
      "AC service checkup",
      "AC installation",
    ],
    Plumbing: [
      "Pipe leak repair",
      "Toilet repair", 
      "Sink installation",
      "Water heater repair",
    ],
    Electrical: [
      "Light fixture installation",
      "Power outlet repair",
      "Circuit breaker fix", 
      "Wiring inspection",
    ],
    Cleaning: [
      "House deep cleaning",
      "Office cleaning",
      "Post-renovation cleaning",
      "Move-in cleaning",
    ],
    Handyman: [
      "Furniture assembly",
      "Wall mounting",
      "Door repair",
      "General maintenance",
    ],
    Gardening: [
      "Lawn mowing",
      "Tree pruning",
      "Garden landscaping",
      "Plant care",
    ],
    Painting: [
      "Room painting",
      "Wall touch-up", 
      "Exterior painting",
      "Furniture painting",
    ],
    Moving: [
      "House moving",
      "Office relocation",
      "Furniture moving",
      "Packing service",
    ],
    "Appliance Repair": [
      "Washing machine repair",
      "Refrigerator fix",
      "Oven repair", 
      "Microwave service",
    ],
    "Pest Control": [
      "Cockroach control",
      "Ant elimination",
      "Termite treatment",
      "General pest control",
    ],
  };

  // Create some historical jobs for demo providers to establish their ratings
  for (const demoProvider of providers.slice(0, 3)) {
    const providerCategories = await prisma.providerCategory.findMany({
      where: { providerId: demoProvider.provider.id },
      include: { category: true }
    });

    // Create 10-15 historical jobs for each demo provider
    const numJobs = Math.floor(Math.random() * 6) + 10;
    for (let i = 0; i < numJobs; i++) {
      const category = providerCategories[Math.floor(Math.random() * providerCategories.length)].category;
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const titles = jobTitles[category.name] || ["General service"];
      const title = titles[Math.floor(Math.random() * titles.length)];
      
      const basePrices = {
        "AC Service": 80,
        Plumbing: 120,
        Electrical: 100,
        Cleaning: 60,
        Handyman: 70,
        Gardening: 90,
        Painting: 150,
        Moving: 200,
        "Appliance Repair": 110,
        "Pest Control": 130,
      };
      
      const basePrice = basePrices[category.name] || 100;
      const finalPrice = basePrice + (Math.random() - 0.5) * basePrice * 0.4;
      const completedAt = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000);

      await prisma.job.create({
        data: {
          customerId: customer.id,
          providerId: demoProvider.user.id,
          categoryId: category.id,
          title,
          description: `Professional ${title.toLowerCase()} service`,
          type: Math.random() > 0.7 ? "QUICK_BOOK" : "POST_QUOTE",
          status: "COMPLETED",
          latitude: demoProvider.location.lat + (Math.random() - 0.5) * 0.01,
          longitude: demoProvider.location.lon + (Math.random() - 0.5) * 0.01,
          address: `Near ${demoProvider.name} service area, Singapore`,
          finalPrice,
          completedAt,
        },
      });

      await prisma.priceHistory.create({
        data: {
          categoryId: category.id,
          price: finalPrice,
          completedAt,
        },
      });
    }
  }

  // Create additional random historical jobs
  const allAreas = [
    { name: "Punggol", lat: 1.3338, lon: 103.8701 },
    { name: "Orchard", lat: 1.3048, lon: 103.8318 },
    { name: "Marina Bay", lat: 1.2835, lon: 103.8607 },
    ...singaporeAreas
  ];

  for (let i = 0; i < 70; i++) {
    const category = createdCategories[Math.floor(Math.random() * createdCategories.length)];
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const providerData = providers[Math.floor(Math.random() * providers.length)];
    const area = allAreas[Math.floor(Math.random() * allAreas.length)];
    const titles = jobTitles[category.name] || ["General service"];
    const title = titles[Math.floor(Math.random() * titles.length)];

    const basePrices = {
      "AC Service": 80,
      Plumbing: 120,
      Electrical: 100,
      Cleaning: 60,
      Handyman: 70,
      Gardening: 90,
      Painting: 150,
      Moving: 200,
      "Appliance Repair": 110,
      "Pest Control": 130,
    };
    
    const basePrice = basePrices[category.name] || 100;
    const finalPrice = basePrice + (Math.random() - 0.5) * basePrice * 0.4;
    const completedAt = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000);

    await prisma.job.create({
      data: {
        customerId: customer.id,
        providerId: providerData.user.id,
        categoryId: category.id,
        title,
        description: `Professional ${title.toLowerCase()} service`,
        type: Math.random() > 0.7 ? "QUICK_BOOK" : "POST_QUOTE",
        status: "COMPLETED",
        latitude: area.lat + (Math.random() - 0.5) * 0.02,
        longitude: area.lon + (Math.random() - 0.5) * 0.02,
        address: `${area.name} Area, Singapore`,
        finalPrice,
        completedAt,
      },
    });

    await prisma.priceHistory.create({
      data: {
        categoryId: category.id,
        price: finalPrice,
        completedAt,
      },
    });
  }

  console.log("✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });