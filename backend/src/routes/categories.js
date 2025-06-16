// routes/categories.js
import { Router } from 'express';

const router = Router();

// Get all active categories
router.get('/', async (req, res) => {
  try {
    const categories = await req.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
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
  
  try {
    const category = await req.prisma.category.findUnique({
      where: { id }
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    console.error('Error getting category:', error);
    res.status(500).json({ error: 'Failed to get category' });
  }
});

export { router as categoryRoutes };