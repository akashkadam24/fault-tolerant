const Queue = require("bull");
const Message = require("../models/Message");
const { MESSAGE_STATUS, REDIS_CONFIG } = require("../config/constants");
const { logger } = require("../utils/logger");

class MessageQueueService {
  constructor() {
    this.io = null;
    this.initializeQueue();
  }

  initializeQueue() {
    this.queue = new Queue("messageQueue", {
      redis: {
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.REDIS_PORT) || 6379,
        retryStrategy: (times) => {
          const delay = Math.min(times * 1000, 15000);
          logger.info(`Retrying Redis connection in ${delay}ms...`);
          return delay;
        },
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        connectTimeout: 10000,
      },
      defaultJobOptions: {
        attempts: parseInt(process.env.MESSAGE_MAX_ATTEMPTS) || 5,
        backoff: {
          type: 'exponential',
          delay: parseInt(process.env.MESSAGE_RETRY_DELAY) || 2000
        },
        removeOnComplete: {
          age: REDIS_CONFIG.KEEP_COMPLETED.AGE,
          count: REDIS_CONFIG.KEEP_COMPLETED.COUNT
        },
        removeOnFail: {
          age: REDIS_CONFIG.KEEP_FAILED.AGE
        }
      }
    });

    this.setupQueueHandlers();
    this.setupErrorHandlers();
  }

  setupQueueHandlers() {
    // Process jobs
    this.queue.process(async (job) => {
      const { messageId } = job.data;
      logger.info(`Processing message ${messageId}, attempt ${job.attemptsMade + 1}`);

      try {
        const message = await this.getMessageById(messageId);
        if (!message) {
          throw new Error(`Message ${messageId} not found`);
        }

        if (message.status === MESSAGE_STATUS.DELIVERED) {
          logger.info(`Message ${messageId} already delivered`);
          return;
        }

        if (message.attempts >= parseInt(process.env.MESSAGE_MAX_ATTEMPTS) || 5) {
          logger.info(`Max attempts reached for message ${messageId}`);
          await this.handleFailedMessage(message);
          return;
        }

        await this.attemptMessageDelivery(message);
        await this.updateMessageProgress(job, message);

      } catch (error) {
        logger.error(`Error processing message ${messageId}:`, error);
        throw error;
      }
    });

    // Handle completed jobs
    this.queue.on('completed', async (job) => {
      logger.info(`Job ${job.id} completed for message ${job.data.messageId}`);
      await this.cleanupMessage(job.data.messageId);
    });

    // Handle failed jobs
    this.queue.on('failed', async (job, err) => {
      logger.error(`Job ${job.id} failed:`, err);
      await this.handleJobFailure(job, err);
    });

    // Handle stalled jobs
    this.queue.on('stalled', async (job) => {
      logger.warn(`Job ${job.id} has stalled and will be retried`);
    });

    // Log successful queue initialization
    this.queue.on('ready', () => {
      logger.info('Redis queue is ready');
    });
  }

  setupErrorHandlers() {
    this.queue.on('error', (error) => {
      logger.error('Redis queue error:', error);
    });

    process.on('SIGTERM', async () => {
      await this.gracefulShutdown();
    });

    process.on('SIGINT', async () => {
      await this.gracefulShutdown();
    });
  }

  setIO(ioInstance) {
    if (!ioInstance) {
      throw new Error('Socket.IO instance is required');
    }
    this.io = ioInstance;
    logger.info('Socket.IO instance set for message queue');
    return this;
  }

  async getMessageById(messageId) {
    try {
      return await Message.findOne({ messageId });
    } catch (error) {
      logger.error(`Error fetching message ${messageId}:`, error);
      throw error;
    }
  }

  async attemptMessageDelivery(message) {
    if (!this.io) {
      throw new Error('Socket.IO instance not initialized');
    }

    try {
      // Check if message was already delivered
      const existingMessage = await Message.findOne({
        messageId: message.messageId,
        status: MESSAGE_STATUS.DELIVERED
      });

      if (existingMessage) {
        logger.info(`Message ${message.messageId} already delivered, skipping`);
        return;
      }

      // Check for duplicate in-flight messages
      const duplicateMessage = await Message.findOne({
        messageId: message.messageId,
        attempts: { $gt: message.attempts }
      });

      if (duplicateMessage) {
        logger.info(`Duplicate message ${message.messageId} detected, skipping`);
        return;
      }

      // Emit message with deduplication metadata
      this.io.emit("receiveMessage", {
        ...message.toObject(),
        requiresAck: true,
        retryAttempt: message.attempts + 1,
        deduplicationId: `${message.messageId}-${message.attempts + 1}`
      });

      message.attempts += 1;
      message.lastAttemptAt = new Date();
      await message.save();

      logger.info(`Message ${message.messageId} sent, attempt ${message.attempts}`);
    } catch (error) {
      logger.error(`Failed to emit message ${message.messageId}:`, error);
      throw error;
    }
  }

  async updateMessageProgress(job, message) {
    try {
      await job.progress(Math.floor((message.attempts / (parseInt(process.env.MESSAGE_MAX_ATTEMPTS) || 5)) * 100));
    } catch (error) {
      logger.error(`Error updating job progress:`, error);
    }
  }

  async handleFailedMessage(message) {
    try {
      message.status = MESSAGE_STATUS.FAILED;
      message.delivered = false;
      await message.save();

      if (this.io) {
        this.io.emit("messageStatus", {
          messageId: message.messageId,
          status: MESSAGE_STATUS.FAILED,
          error: "Max retry attempts reached",
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error(`Error handling failed message:`, error);
      throw error;
    }
  }

  async handleJobFailure(job, error) {
    const { messageId } = job.data;
    try {
      const message = await this.getMessageById(messageId);
      if (message) {
        await this.handleFailedMessage(message);
      }
    } catch (err) {
      logger.error(`Error handling job failure for message ${messageId}:`, err);
    }
  }

  async cleanupMessage(messageId) {
    try {
      const message = await this.getMessageById(messageId);
      if (message && message.status === MESSAGE_STATUS.DELIVERED) {
        setTimeout(async () => {
          try {
            await Message.deleteOne({ messageId });
            logger.info(`Cleaned up delivered message ${messageId}`);
          } catch (error) {
            logger.error(`Error during message cleanup:`, error);
          }
        }, REDIS_CONFIG.KEEP_COMPLETED.AGE * 1000);
      }
    } catch (error) {
      logger.error(`Error initiating message cleanup:`, error);
    }
  }

  async addMessage(messageId, options = {}) {
    try {
      return await this.queue.add({ messageId }, {
        ...options,
        attempts: parseInt(process.env.MESSAGE_MAX_ATTEMPTS) || 5,
        delay: parseInt(process.env.MESSAGE_RETRY_DELAY) || 2000,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Error adding message to queue:`, error);
      throw error;
    }
  }

  async getQueueStatus() {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount()
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting queue status:', error);
      throw error;
    }
  }

  async gracefulShutdown() {
    try {
      logger.info('Shutting down queue...');
      await this.queue.pause(true);
      await this.queue.close();
      logger.info('Queue shut down successfully');
    } catch (error) {
      logger.error('Error during queue shutdown:', error);
    }
  }
}

// Create and export singleton instance
const messageQueueService = new MessageQueueService();
module.exports = messageQueueService;
