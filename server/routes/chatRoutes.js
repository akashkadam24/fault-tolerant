const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const messageQueueService = require('../services/RedisQueue');
const { MESSAGE_STATUS } = require('../config/constants');

// Validation middleware
const validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  
  if (page < 1 || limit < 1 || limit > 100) {
    return res.status(400).json({
      error: 'Invalid pagination parameters',
      details: 'Page must be >= 1, limit must be between 1 and 100'
    });
  }
  
  req.pagination = { page, limit };
  next();
};

const validateDateRange = (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  if (startDate && !Date.parse(startDate)) {
    return res.status(400).json({
      error: 'Invalid startDate format',
      details: 'Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)'
    });
  }
  
  if (endDate && !Date.parse(endDate)) {
    return res.status(400).json({
      error: 'Invalid endDate format',
      details: 'Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)'
    });
  }
  
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    return res.status(400).json({
      error: 'Invalid date range',
      details: 'startDate must be before endDate'
    });
  }
  
  next();
};

// Get message history with pagination
router.get('/messages', 
  validatePagination,
  validateDateRange,
  async (req, res) => {
    try {
      const { page, limit } = req.pagination;
      const { sender, status, startDate, endDate } = req.query;

      const query = {};
      if (sender) query.sender = sender;
      if (status && Object.values(MESSAGE_STATUS).includes(status)) {
        query.status = status;
      }
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const [messages, total] = await Promise.all([
        Message.find(query)
          .sort({ sequenceNumber: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Message.countDocuments(query)
      ]);

      res.json({
        messages,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalMessages: total,
          limit
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({
        error: 'Failed to fetch messages',
        details: error.message
      });
    }
});

// Get failed messages for a user
router.get('/messages/failed', async (req, res) => {
  try {
    const { sender } = req.query;
    if (!sender) {
      return res.status(400).json({
        error: 'Sender parameter is required',
        details: 'Provide a valid sender ID'
      });
    }

    const failedMessages = await Message.findFailedMessages(sender);
    res.json({
      messages: failedMessages,
      count: failedMessages.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching failed messages:', error);
    res.status(500).json({
      error: 'Failed to fetch failed messages',
      details: error.message
    });
  }
});

// Retry failed messages
router.post('/messages/retry', async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid message IDs',
        details: 'Provide an array of message IDs to retry'
      });
    }

    if (messageIds.length > 100) {
      return res.status(400).json({
        error: 'Too many messages',
        details: 'Maximum 100 messages can be retried at once'
      });
    }

    const results = await Promise.all(messageIds.map(async (messageId) => {
      try {
        const message = await Message.findOne({ messageId });
        if (!message) {
          return { messageId, status: 'not_found' };
        }

        if (message.status === MESSAGE_STATUS.DELIVERED) {
          return { messageId, status: 'already_delivered' };
        }

        // Reset message state for retry
        message.status = MESSAGE_STATUS.PENDING;
        message.attempts = 0;
        message.error = null;
        await message.save();

        // Add to retry queue
        await messageQueueService.addMessage(messageId);

        return { messageId, status: 'queued_for_retry' };
      } catch (error) {
        return { messageId, status: 'retry_failed', error: error.message };
      }
    }));

    res.json({
      results,
      summary: {
        total: results.length,
        queued: results.filter(r => r.status === 'queued_for_retry').length,
        notFound: results.filter(r => r.status === 'not_found').length,
        alreadyDelivered: results.filter(r => r.status === 'already_delivered').length,
        failed: results.filter(r => r.status === 'retry_failed').length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error retrying messages:', error);
    res.status(500).json({
      error: 'Failed to retry messages',
      details: error.message
    });
  }
});

// Get system status and statistics
router.get('/status', async (req, res) => {
  try {
    const [queueStatus, messageStats, recentActivity] = await Promise.all([
      messageQueueService.getQueueStatus(),
      Message.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            avgAttempts: { $avg: '$attempts' },
            maxAttempts: { $max: '$attempts' }
          }
        }
      ]),
      Message.aggregate([
        {
          $match: {
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: {
              status: '$status',
              hour: { $hour: '$timestamp' }
            },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const stats = {
      queue: queueStatus,
      messages: messageStats.reduce((acc, stat) => {
        acc[stat._id] = {
          count: stat.count,
          avgAttempts: Math.round(stat.avgAttempts * 100) / 100,
          maxAttempts: stat.maxAttempts
        };
        return acc;
      }, {}),
      hourlyActivity: recentActivity.reduce((acc, stat) => {
        const key = `${stat._id.status}_${stat._id.hour}`;
        acc[key] = stat.count;
        return acc;
      }, {}),
      timestamp: new Date().toISOString()
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching system status:', error);
    res.status(500).json({
      error: 'Failed to fetch system status',
      details: error.message
    });
  }
});

// Clean up delivered messages
router.delete('/messages/cleanup', async (req, res) => {
  try {
    const { olderThan, status } = req.query;
    const date = olderThan ? new Date(olderThan) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (!Date.parse(date)) {
      return res.status(400).json({
        error: 'Invalid date format',
        details: 'Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)'
      });
    }

    const query = {
      deliveredAt: { $lt: date }
    };

    if (status && Object.values(MESSAGE_STATUS).includes(status)) {
      query.status = status;
    } else {
      query.status = MESSAGE_STATUS.DELIVERED;
    }

    const result = await Message.deleteMany(query);

    res.json({
      deletedCount: result.deletedCount,
      query: {
        olderThan: date.toISOString(),
        status: query.status
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error cleaning up messages:', error);
    res.status(500).json({
      error: 'Failed to clean up messages',
      details: error.message
    });
  }
});

// Get message delivery statistics
router.get('/statistics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const timeRange = {
      $gte: startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000),
      $lte: endDate ? new Date(endDate) : new Date()
    };

    const stats = await Message.aggregate([
      {
        $match: {
          timestamp: timeRange
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgDeliveryTime: {
            $avg: {
              $cond: [
                { $eq: ['$status', MESSAGE_STATUS.DELIVERED] },
                { $subtract: ['$deliveredAt', '$timestamp'] },
                null
              ]
            }
          },
          avgAttempts: { $avg: '$attempts' }
        }
      }
    ]);

    res.json({
      timeRange: {
        start: timeRange.$gte,
        end: timeRange.$lte
      },
      statistics: stats.reduce((acc, stat) => {
        acc[stat._id] = {
          count: stat.count,
          avgDeliveryTime: stat.avgDeliveryTime ? Math.round(stat.avgDeliveryTime / 1000) : null,
          avgAttempts: Math.round(stat.avgAttempts * 100) / 100
        };
        return acc;
      }, {}),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching message statistics:', error);
    res.status(500).json({
      error: 'Failed to fetch message statistics',
      details: error.message
    });
  }
});

module.exports = router;
