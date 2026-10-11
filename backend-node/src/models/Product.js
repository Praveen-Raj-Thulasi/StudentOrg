import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const productSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, default: '' },
    category: {
      type: String,
      enum: ['APPAREL', 'ACCESSORIES', 'STATIONERY', 'STICKERS', 'MEMORABILIA', 'OTHER'],
      default: 'APPAREL',
      index: true,
    },
    // Keep each apparel size as its own SKU so reservations and stock movements stay atomic.
    size: {
      type: String,
      enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'ONE_SIZE', 'CUSTOM'],
      default: 'ONE_SIZE',
      index: true,
    },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', uppercase: true },
    stockQuantity: { type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 },
    reservedQuantity: { type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 },
    imageUrl: { type: String, default: null, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    collection: 'products',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

productSchema.virtual('availableQuantity').get(function () {
  return Math.max(0, (this.stockQuantity || 0) - (this.reservedQuantity || 0));
});

productSchema.pre('validate', async function () {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('products');
  }
});

export const Product = mongoose.model('Product', productSchema);
export default Product;
