import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { BadRequestError } from './errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

// Ensure subdirectories exist
const subdirs = [
  'banners',
  'posters',
  'logos',
  'profiles',
  'documents',
  'templates',
  'signatures',
  'voice',
  'attachments',
  'reimbursements',
];

for (const dir of subdirs) {
  const fullPath = path.join(UPLOAD_DIR, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
}

export function createUploader(subdir = '', { imageOnly = false } = {}) {
  const targetDir = subdir ? path.join(UPLOAD_DIR, subdir) : UPLOAD_DIR;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, targetDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  });

  const options = {
    storage,
    limits: { fileSize: imageOnly ? 8 * 1024 * 1024 : 15 * 1024 * 1024 },
  };
  if (imageOnly) {
    options.fileFilter = (_req, file, cb) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        return cb(new BadRequestError('Upload a JPG, PNG, or WebP image.', 'INVALID_RECEIPT_IMAGE'));
      }
      cb(null, true);
    };
  }
  return multer(options);
}
