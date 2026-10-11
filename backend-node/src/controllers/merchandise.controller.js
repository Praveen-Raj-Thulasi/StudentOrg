import { MerchandiseService } from '../services/merchandise.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class MerchandiseController {
  /* ==================== PRODUCTS ==================== */

  static async createProduct(req, res, next) {
    try {
      const product = await MerchandiseService.createProduct(req.body, req.user.id);
      return ApiResponse.created(res, product, 'Product created successfully');
    } catch (err) {
      next(err);
    }
  }

  static async updateProduct(req, res, next) {
    try {
      const product = await MerchandiseService.updateProduct(
        req.params.id,
        req.body,
        req.user.id
      );
      return ApiResponse.success(res, product, 'Product updated');
    } catch (err) {
      next(err);
    }
  }

  static async getProducts(req, res, next) {
    try {
      const isPrivileged = ['TREASURER', 'PRESIDENT', 'ADMIN'].includes(req.user?.role);
      const products = await MerchandiseService.getProducts(req.query, isPrivileged);
      return ApiResponse.success(res, products);
    } catch (err) {
      next(err);
    }
  }

  static async getProductById(req, res, next) {
    try {
      const product = await MerchandiseService.getProductById(req.params.id);
      return ApiResponse.success(res, product);
    } catch (err) {
      next(err);
    }
  }

  /* ==================== INVENTORY ==================== */

  static async adjustStock(req, res, next) {
    try {
      const result = await MerchandiseService.adjustStock(
        req.params.id,
        req.body,
        req.user.id
      );
      return ApiResponse.success(res, result, 'Stock adjusted and movement recorded');
    } catch (err) {
      next(err);
    }
  }

  static async getMovements(req, res, next) {
    try {
      const movements = await MerchandiseService.getInventoryMovements(
        req.query.productId,
        req.query.limit || 50
      );
      return ApiResponse.success(res, movements);
    } catch (err) {
      next(err);
    }
  }

  /* ==================== ORDERS ==================== */

  static async createOrder(req, res, next) {
    try {
      const result = await MerchandiseService.createOrder(req.user.id, req.body);
      return ApiResponse.created(res, result, 'Order created and stock held for payment');
    } catch (err) {
      next(err);
    }
  }

  static async confirmOrder(req, res, next) {
    try {
      const order = await MerchandiseService.confirmOrderPayment(
        req.params.id,
        req.body || {}
      );
      return ApiResponse.success(res, order, 'Order confirmed and inventory finalized');
    } catch (err) {
      next(err);
    }
  }

  static async cancelOrder(req, res, next) {
    try {
      const order = await MerchandiseService.cancelOrder(
        req.params.id,
        req.body?.reason,
        req.user.id
      );
      return ApiResponse.success(res, order, 'Order cancelled and reservation released');
    } catch (err) {
      next(err);
    }
  }

  static async getMyOrders(req, res, next) {
    try {
      const orders = await MerchandiseService.getMyOrders(req.user.id);
      return ApiResponse.success(res, orders);
    } catch (err) {
      next(err);
    }
  }

  static async getAllOrders(req, res, next) {
    try {
      const orders = await MerchandiseService.getAllOrders(req.query);
      return ApiResponse.success(res, orders);
    } catch (err) {
      next(err);
    }
  }
}

export default MerchandiseController;
