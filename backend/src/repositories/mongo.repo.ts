import mongoose from 'mongoose';

export const mongoRepo = {
  async isReady(): Promise<boolean> {
    try {
      if (mongoose.connection.readyState === 1) {
        return true;
      }
      if (!mongoose.connection.db) {
        return false;
      }
      await mongoose.connection.db.admin().ping();
      return true;
    } catch {
      return false;
    }
  },
};