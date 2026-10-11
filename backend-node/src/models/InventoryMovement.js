import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const inventoryMovementSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    productId: { type: Number, required: true, index: true },
    sku: { type: String, required: true, index: true },
    movementType: {
      type: String,
      enum: ['STOCK_IN', 'ADJUSTMENT', 'SALE_DEDUCTION', 'RESERVATION_HOLD', 'RESERVATION_RELEASE'],
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    actorId: { type: Number, required: true, index: true },
    reason: { type: String, required: true, trim: true },
    reference: { type: String, default: null, trim: true },
  },
  {
    collection: 'inventory_movements',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

inventoryMovementSchema.pre('validate', async function () {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('inventory_movements');
  }
});

export const InventoryMovement = mongoose.model('InventoryMovement', inventoryMovementSchema);
export default InventoryMovement;
