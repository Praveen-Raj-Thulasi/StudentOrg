import { Router } from 'express';
import { MerchandiseController } from '../controllers/merchandise.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Products
router.get(
  '/merchandise/products',
  authenticateToken,
  asyncHandler(MerchandiseController.getProducts)
);

router.get(
  '/merchandise/products/:id',
  authenticateToken,
  asyncHandler(MerchandiseController.getProductById)
);

router.post(
  '/merchandise/products',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(MerchandiseController.createProduct)
);

router.put(
  '/merchandise/products/:id',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(MerchandiseController.updateProduct)
);

// Inventory adjustments & movements
router.post(
  '/merchandise/products/:id/adjust-stock',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(MerchandiseController.adjustStock)
);

router.get(
  '/merchandise/movements',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(MerchandiseController.getMovements)
);

// Orders
router.post(
  '/merchandise/orders',
  authenticateToken,
  asyncHandler(MerchandiseController.createOrder)
);

router.post(
  '/merchandise/orders/:id/cancel',
  authenticateToken,
  asyncHandler(MerchandiseController.cancelOrder)
);

router.get(
  '/merchandise/orders/my',
  authenticateToken,
  asyncHandler(MerchandiseController.getMyOrders)
);

router.get(
  '/merchandise/orders',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(MerchandiseController.getAllOrders)
);

export default router;
