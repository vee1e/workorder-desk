import mongoose from 'mongoose';
import { validation } from './http-error.js';

export function assertValidObjectId(id: string, field = 'id'): void {
  if (!mongoose.isValidObjectId(id)) {
    throw validation([{ field, message: 'Invalid id' }]);
  }
}