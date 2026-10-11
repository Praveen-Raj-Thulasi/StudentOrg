import {
  Product,
  InventoryMovement,
  MerchandiseOrder,
  Payment,
  AuditLog,
} from '../models/index.js';
import { FinanceService } from './finance.service.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export class MerchandiseService {
  /* =========================================================================
   * 1. PRODUCT CATALOGUE
   * ========================================================================= */

  static async createProduct(data, actorId) {
    if (!data.name || !data.sku || data.price === undefined) {
      throw new BadRequestError('Name, SKU, and price are required');
    }
    const sku = data.sku.trim().toUpperCase();
    const existing = await Product.findOne({ sku });
    if (existing) {
      throw new ConflictError(`Product with SKU "${sku}" already exists`);
    }

    const price = Number(data.price);
    if (isNaN(price) || price < 0) {
      throw new BadRequestError('Product price must be a non-negative number');
    }

    const initialStock = Number(data.stockQuantity || 0);
    if (!Number.isInteger(initialStock) || initialStock < 0) {
      throw new BadRequestError('Stock quantity must be a non-negative whole number');
    }

    const product = new Product({
      sku,
      name: data.name.trim(),
      description: (data.description || '').trim(),
      category: data.category || 'APPAREL',
      size: String(data.size || 'ONE_SIZE').trim().toUpperCase(),
      price,
      currency: data.currency || 'INR',
      stockQuantity: initialStock,
      reservedQuantity: 0,
      imageUrl: data.imageUrl || null,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    });

    const saved = await product.save();

    if (initialStock > 0) {
      await InventoryMovement.create({
        productId: saved.id,
        sku: saved.sku,
        movementType: 'STOCK_IN',
        quantity: initialStock,
        previousStock: 0,
        newStock: initialStock,
        actorId,
        reason: 'Initial stock intake',
        reference: `INIT-${saved.sku}`,
      });
    }

    await AuditLog.create({
      userId: actorId,
      role: 'TREASURER',
      action: 'PRODUCT_CREATED',
      resourceType: 'PRODUCT',
      resourceId: String(saved.id),
      details: `Created product ${saved.name} (SKU: ${saved.sku}) with price ${saved.price}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  static async updateProduct(productId, data, actorId) {
    const product = await Product.findOne({ id: Number(productId) });
    if (!product) throw new NotFoundError(`Product #${productId} not found`);

    if (data.name) product.name = data.name.trim();
    if (data.description !== undefined) product.description = data.description.trim();
    if (data.category) product.category = data.category;
    if (data.size !== undefined) product.size = String(data.size || 'ONE_SIZE').trim().toUpperCase();
    if (data.price !== undefined) {
      const price = Number(data.price);
      if (isNaN(price) || price < 0) throw new BadRequestError('Invalid price');
      product.price = price;
    }
    if (data.imageUrl !== undefined) product.imageUrl = data.imageUrl;
    if (data.isActive !== undefined) product.isActive = Boolean(data.isActive);

    const saved = await product.save();

    await AuditLog.create({
      userId: actorId,
      role: 'TREASURER',
      action: 'PRODUCT_UPDATED',
      resourceType: 'PRODUCT',
      resourceId: String(saved.id),
      details: `Updated product ${saved.sku}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  static async getProducts(filter = {}, includeInactive = false) {
    const query = {};
    if (!includeInactive) query.isActive = true;
    if (filter.category) query.category = filter.category;

    const products = await Product.find(query).sort({ createdAt: -1 });
    return products.map((p) => ({
      ...p.toObject(),
      availableQuantity: Math.max(0, (p.stockQuantity || 0) - (p.reservedQuantity || 0)),
    }));
  }

  static async getProductById(productId) {
    const product = await Product.findOne({ id: Number(productId) });
    if (!product) throw new NotFoundError(`Product #${productId} not found`);
    return {
      ...product.toObject(),
      availableQuantity: Math.max(0, (product.stockQuantity || 0) - (product.reservedQuantity || 0)),
    };
  }

  /* =========================================================================
   * 2. INVENTORY ADJUSTMENTS
   * ========================================================================= */

  static async adjustStock(productId, { quantityDelta, reason }, actorId) {
    const delta = Number(quantityDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      throw new BadRequestError('quantityDelta must be a non-zero whole number');
    }
    if (!reason || !reason.trim()) {
      throw new BadRequestError('Reason is required for inventory adjustment');
    }

    const previousProduct = await Product.findOneAndUpdate(
      {
        id: Number(productId),
        $expr: { $gte: [{ $add: ['$stockQuantity', delta] }, '$reservedQuantity'] },
      },
      { $inc: { stockQuantity: delta } },
      { new: false, runValidators: true }
    );
    if (!previousProduct) {
      const exists = await Product.exists({ id: Number(productId) });
      if (!exists) throw new NotFoundError(`Product #${productId} not found`);
      throw new BadRequestError('Stock adjustment would reduce inventory below the reserved quantity');
    }

    const previousStock = previousProduct.stockQuantity;
    const newStock = previousStock + delta;
    const product = await Product.findOne({ id: Number(productId) });

    const movement = await InventoryMovement.create({
      productId: product.id,
      sku: product.sku,
      movementType: delta > 0 ? 'STOCK_IN' : 'ADJUSTMENT',
      quantity: delta,
      previousStock,
      newStock,
      actorId,
      reason: reason.trim(),
      reference: `ADJ-${Date.now()}`,
    });

    await AuditLog.create({
      userId: actorId,
      role: 'TREASURER',
      action: 'INVENTORY_ADJUSTED',
      resourceType: 'INVENTORY',
      resourceId: String(product.id),
      details: `Stock for ${product.sku} adjusted by ${delta}. Previous: ${previousStock}, New: ${newStock}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return { product, movement };
  }

  static async getInventoryMovements(productId = null, limit = 50) {
    const query = productId ? { productId: Number(productId) } : {};
    return InventoryMovement.find(query).sort({ createdAt: -1 }).limit(Number(limit));
  }

  /* =========================================================================
   * 3. ORDERS & CONCURRENCY-SAFE RESERVATIONS
   * ========================================================================= */

  static async createOrder(userId, { items = [] }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestError('Order must contain at least one item');
    }

    // Clean up any stale expired orders first
    await this.releaseExpiredReservations().catch((err) =>
      logger.warn(`Error releasing expired reservations: ${err.message}`)
    );

    const reservedProducts = [];
    const orderItems = [];
    let totalAmount = 0;

    try {
      for (const item of items) {
        const prodId = Number(item.productId);
        const qty = Number(item.quantity);

        if (!Number.isInteger(qty) || qty <= 0) {
          throw new BadRequestError('Quantity must be a positive whole number');
        }

        // Atomically hold reservation: only if available stock (stockQuantity - reservedQuantity) >= qty
        const updated = await Product.findOneAndUpdate(
          {
            id: prodId,
            isActive: true,
            $expr: {
              $gte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, qty],
            },
          },
          {
            $inc: { reservedQuantity: qty },
          },
          { new: true }
        );

        if (!updated) {
          throw new ConflictError(
            `Insufficient stock or unavailable item for product #${prodId}`
          );
        }

        reservedProducts.push({ product: updated, qty });

        const subtotal = Number((updated.price * qty).toFixed(2));
        totalAmount += subtotal;

        orderItems.push({
          productId: updated.id,
          sku: updated.sku,
          name: updated.name,
          size: updated.size || 'ONE_SIZE',
          unitPrice: updated.price,
          quantity: qty,
          subtotal,
        });

        // Log reservation hold movement
        await InventoryMovement.create({
          productId: updated.id,
          sku: updated.sku,
          movementType: 'RESERVATION_HOLD',
          quantity: qty,
          previousStock: updated.stockQuantity,
          newStock: updated.stockQuantity,
          actorId: userId,
          reason: `Reservation hold for pending order by user #${userId}`,
        });
      }

      // Order reservation holds for 15 minutes
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const order = new MerchandiseOrder({
        userId,
        items: orderItems,
        totalAmount: Number(totalAmount.toFixed(2)),
        currency: 'INR',
        orderStatus: 'PENDING',
        paymentStatus: 'PENDING',
        expiresAt,
      });

      const savedOrder = await order.save();

      // Create Payment intent
      const payment = new Payment({
        transactionId: `TXN-MERCH-${savedOrder.orderNumber}-${Date.now()}`,
        userId,
        orderId: savedOrder.id,
        paymentType: 'MERCHANDISE',
        amount: savedOrder.totalAmount,
        paymentStatus: 'PENDING',
      });
      await payment.save();

      savedOrder.paymentId = payment.id;
      savedOrder.transactionId = payment.transactionId;
      await savedOrder.save();

      return {
        order: savedOrder,
        payment,
      };
    } catch (err) {
      // Rollback any products already reserved in this transaction
      for (const res of reservedProducts) {
        await Product.findOneAndUpdate(
          { id: res.product.id },
          { $inc: { reservedQuantity: -res.qty } }
        ).catch((rbErr) =>
          logger.error(`Failed to rollback reservation for ${res.product.sku}: ${rbErr.message}`)
        );
      }
      throw err;
    }
  }

  static async confirmOrderPayment(orderId, paymentConfirmation = {}) {
    const order = await MerchandiseOrder.findOne({ id: Number(orderId) });
    if (!order) throw new NotFoundError(`Order #${orderId} not found`);

    if (order.orderStatus === 'CONFIRMED' && order.paymentStatus === 'PAID') {
      return order; // Idempotent success
    }

    if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'EXPIRED') {
      throw new BadRequestError(`Cannot pay an order in ${order.orderStatus} status`);
    }
    if (order.totalAmount > 0 && paymentConfirmation.verifiedByGateway !== true) {
      throw new ForbiddenError('Merchandise orders require verified payment gateway confirmation');
    }

    // Deduct stock and release reservation
    for (const item of order.items) {
      const product = await Product.findOne({ id: item.productId });
      if (product) {
        const prevStock = product.stockQuantity;
        const newStock = Math.max(0, prevStock - item.quantity);
        const newReserved = Math.max(0, product.reservedQuantity - item.quantity);

        product.stockQuantity = newStock;
        product.reservedQuantity = newReserved;
        await product.save();

        await InventoryMovement.create({
          productId: product.id,
          sku: product.sku,
          movementType: 'SALE_DEDUCTION',
          quantity: item.quantity,
          previousStock: prevStock,
          newStock,
          actorId: order.userId,
          reason: `Completed order ${order.orderNumber}`,
          reference: order.orderNumber,
        });
      }
    }

    order.orderStatus = 'CONFIRMED';
    order.paymentStatus = 'PAID';
    order.confirmedAt = new Date();
    if (paymentConfirmation.transactionId) {
      order.transactionId = paymentConfirmation.transactionId;
    }

    const saved = await order.save();

    // Mark corresponding Payment record as SUCCESSFUL
    if (order.paymentId) {
      await Payment.findOneAndUpdate(
        { id: order.paymentId },
        {
          paymentStatus: 'SUCCESSFUL',
          paidAt: new Date(),
          gatewayReference: paymentConfirmation.gatewayReference || null,
          gatewayTransactionId: paymentConfirmation.transactionId || paymentConfirmation.gatewayReference || null,
        }
      );
    }

    // Post to General Ledger as INCOME
    await FinanceService.recordLedgerEntry({
      entryType: 'INCOME',
      amount: saved.totalAmount,
      currency: saved.currency,
      category: 'MERCHANDISE_SALES',
      description: `Merchandise sales income for order ${saved.orderNumber}`,
      sourceReference: saved.orderNumber,
      sourceModel: 'Order',
      idempotencyKey: `MERCHANDISE_ORDER_${saved.orderNumber}`,
      postedBy: order.userId,
    });

    return saved;
  }

  static async cancelOrder(orderId, reason = 'Cancelled by user', actorId = null) {
    const order = await MerchandiseOrder.findOne({ id: Number(orderId) });
    if (!order) throw new NotFoundError(`Order #${orderId} not found`);
    if (actorId !== null && Number(order.userId) !== Number(actorId)) {
      throw new ForbiddenError('You can only cancel your own merchandise order');
    }

    if (order.orderStatus === 'CONFIRMED') {
      throw new ConflictError('Cannot cancel an already confirmed order without a return/refund workflow');
    }
    if (order.orderStatus === 'CANCELLED') {
      return order;
    }

    // Release reservations if it was PENDING
    if (order.orderStatus === 'PENDING') {
      for (const item of order.items) {
        await Product.findOneAndUpdate(
          { id: item.productId },
          { $inc: { reservedQuantity: -item.quantity } }
        );

        await InventoryMovement.create({
          productId: item.productId,
          sku: item.sku,
          movementType: 'RESERVATION_RELEASE',
          quantity: item.quantity,
          previousStock: 0,
          newStock: 0,
          actorId: actorId || order.userId,
          reason: `Released reservation for cancelled order ${order.orderNumber}: ${reason}`,
          reference: order.orderNumber,
        }).catch((err) => logger.warn(`InventoryMovement log error: ${err.message}`));
      }
    }

    order.orderStatus = 'CANCELLED';
    order.cancellationReason = reason;
    return order.save();
  }

  static async releaseExpiredReservations() {
    const expiredOrders = await MerchandiseOrder.find({
      orderStatus: 'PENDING',
      expiresAt: { $lt: new Date() },
    });

    let count = 0;
    for (const order of expiredOrders) {
      for (const item of order.items) {
        await Product.findOneAndUpdate(
          { id: item.productId },
          { $inc: { reservedQuantity: -item.quantity } }
        );

        await InventoryMovement.create({
          productId: item.productId,
          sku: item.sku,
          movementType: 'RESERVATION_RELEASE',
          quantity: item.quantity,
          previousStock: 0,
          newStock: 0,
          actorId: order.userId,
          reason: `Released expired reservation for order ${order.orderNumber}`,
          reference: order.orderNumber,
        }).catch((err) => logger.warn(`Inventory movement failure: ${err.message}`));
      }
      order.orderStatus = 'EXPIRED';
      await order.save();
      count++;
    }

    return { expiredCount: count };
  }

  static async getMyOrders(userId) {
    return MerchandiseOrder.find({ userId: Number(userId) }).sort({ createdAt: -1 });
  }

  static async getAllOrders(filter = {}) {
    const query = {};
    if (filter.orderStatus) query.orderStatus = filter.orderStatus;
    if (filter.paymentStatus) query.paymentStatus = filter.paymentStatus;
    return MerchandiseOrder.find(query).sort({ createdAt: -1 });
  }
}

export default MerchandiseService;
