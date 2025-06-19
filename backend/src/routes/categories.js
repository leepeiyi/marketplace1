// routes/categories.js
import { Router } from 'express';

const router = Router();

// Get all active categories
router.get('/', async (req, res) => {
  try {
    const categories = await req.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });
    res.json(categories);
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// Get category by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  // Basic validation - reject obviously invalid IDs
  if (!id || id.trim() === '') {
    return res.status(404).json({ error: 'Category not found' });
  }
  
  try {
    const category = await req.prisma.category.findUnique({
      where: { id: id.trim() },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    console.error('Error getting category:', error);
    // For invalid ID format errors, return 404 instead of 500
    if (error.code === 'P2023' || error.message?.includes('Invalid ID')) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.status(500).json({ error: 'Failed to get category' });
  }
});

// GET /api/categories/price-range/:categoryId
router.get("/price-range/:categoryId", async (req, res) => {
  const { categoryId } = req.params;

  // Basic validation
  if (!categoryId || categoryId.trim() === '') {
    return res.status(404).json({ error: 'Category not found' });
  }

  try {
    // First check if category exists
    const category = await req.prisma.category.findUnique({
      where: { id: categoryId.trim() },
      select: { id: true }
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Get price history for this category
    const prices = await req.prisma.priceHistory.findMany({
      where: { categoryId: categoryId.trim() },
      select: { price: true },
      orderBy: { completedAt: "desc" },
      take: 100, // limit to recent 100
    });

    if (!prices.length) {
      return res.status(404).json({ error: "No price data found" });
    }

    const values = prices.map(p => p.price);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    res.json({
      categoryId: categoryId.trim(),
      minPrice: Math.floor(min),
      maxPrice: Math.ceil(max),
      suggestedPrice: Math.round(avg),
      sampleSize: values.length
    });
  } catch (error) {
    console.error("Failed to fetch price range:", error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2023' || error.message?.includes('Invalid ID')) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.status(500).json({ error: "Failed to get price range" });
  }
});

// Additional route: Get categories with job counts (useful for admin)
router.get('/stats/overview', async (req, res) => {
  try {
    const categoriesWithStats = await req.prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        icon: true,
        _count: {
          select: {
            jobs: true,
            providerCategories: true,
            priceHistory: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const stats = categoriesWithStats.map(category => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      jobCount: category._count.jobs,
      providerCount: category._count.providerCategories,
      priceHistoryCount: category._count.priceHistory
    }));

    res.json(stats);
  } catch (error) {
    console.error('Error getting category stats:', error);
    res.status(500).json({ error: 'Failed to get category statistics' });
  }
});

export { router as categoryRoutes };