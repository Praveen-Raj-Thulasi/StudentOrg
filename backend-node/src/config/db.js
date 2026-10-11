import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let isConnecting = false;

/**
 * Initializes and establishes connection to MongoDB.
 * @param {string} [uri] Optional override URI
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDB(uri = env.MONGODB_URI) {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (isConnecting) {
    logger.info('MongoDB connection already in progress...');
    return mongoose;
  }

  isConnecting = true;

  try {
    mongoose.connection.on('connected', () => {
      logger.info({
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        dbName: mongoose.connection.name,
      }, 'MongoDB connection established successfully');
    });

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, `MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB connection lost / disconnected');
    });

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: env.NODE_ENV !== 'production',
    });

    return mongoose;
  } catch (error) {
    logger.error({ err: error }, `Failed to connect to MongoDB: ${error.message}`);
    throw error;
  } finally {
    isConnecting = false;
  }
}

/**
 * Gracefully disconnects from MongoDB.
 */
export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.close(false);
      logger.info('MongoDB connection closed gracefully');
    } catch (error) {
      logger.error({ err: error }, `Error while closing MongoDB connection: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Retrieves the current connection health status.
 * 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
 */
export function getConnectionStatus() {
  const stateMap = {
    0: 'DISCONNECTED',
    1: 'CONNECTED',
    2: 'CONNECTING',
    3: 'DISCONNECTING',
  };

  const state = mongoose.connection.readyState;
  return {
    state: stateMap[state] || 'UNKNOWN',
    isReady: state === 1,
    host: mongoose.connection.host || null,
    dbName: mongoose.connection.name || null,
  };
}

export default { connectDB, disconnectDB, getConnectionStatus };
