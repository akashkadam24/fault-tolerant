const mongoose = require('mongoose');
const { MESSAGE_STATUS } = require('../config/constants');

const messageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  text: {
    type: String,
    required: true
  },
  sender: {
    type: String,
    required: true,
    index: true
  },
  recipients: [{
    type: String,
    index: true
  }],
  sequenceNumber: {
    type: Number,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: Object.values(MESSAGE_STATUS),
    default: MESSAGE_STATUS.PENDING,
    index: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  delivered: {
    type: Boolean,
    default: false,
    index: true
  },
  acknowledged: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  deliveredAt: {
    type: Date,
    sparse: true
  },
  lastAttemptAt: {
    type: Date,
    sparse: true
  },
  error: {
    message: String,
    code: String,
    timestamp: Date
  }
}, {
  timestamps: true,
  // Add optimistic concurrency control
  optimisticConcurrency: true,
  // Enable strict mode for better error catching
  strict: true
});

// Compound indexes for efficient queries
messageSchema.index({ sender: 1, status: 1 });
messageSchema.index({ messageId: 1, status: 1 });
messageSchema.index({ sequenceNumber: 1, timestamp: 1 });
messageSchema.index({ delivered: 1, timestamp: 1 });
messageSchema.index({ status: 1, attempts: 1 });

// Instance methods for state transitions
messageSchema.methods.markDelivered = async function() {
  this.status = MESSAGE_STATUS.DELIVERED;
  this.delivered = true;
  this.deliveredAt = new Date();
  this.error = null;
  return this.save();
};

messageSchema.methods.markFailed = async function(error) {
  this.status = MESSAGE_STATUS.FAILED;
  this.delivered = false;
  this.error = {
    message: error.message,
    code: error.code,
    timestamp: new Date()
  };
  return this.save();
};

messageSchema.methods.incrementAttempts = async function() {
  this.attempts += 1;
  this.lastAttemptAt = new Date();
  return this.save();
};

messageSchema.methods.acknowledge = async function() {
  this.acknowledged = true;
  return this.save();
};

// Static methods for querying
messageSchema.statics.findPendingMessages = function(sender) {
  return this.find({
    sender,
    status: MESSAGE_STATUS.PENDING,
    attempts: { $lt: parseInt(process.env.MESSAGE_MAX_ATTEMPTS) || 5 }
  })
  .sort({ sequenceNumber: 1 })
  .lean();
};

messageSchema.statics.findFailedMessages = function(sender) {
  return this.find({
    sender,
    status: MESSAGE_STATUS.FAILED
  })
  .sort({ timestamp: -1 })
  .lean();
};

messageSchema.statics.findMessagesByTimeRange = function(startTime, endTime, options = {}) {
  const query = {
    timestamp: {
      $gte: startTime,
      $lte: endTime
    }
  };

  if (options.sender) {
    query.sender = options.sender;
  }

  if (options.status) {
    query.status = options.status;
  }

  return this.find(query)
    .sort({ sequenceNumber: 1 })
    .lean();
};

messageSchema.statics.findUndeliveredMessages = function(sender, maxAge = 24 * 60 * 60 * 1000) {
  const cutoffTime = new Date(Date.now() - maxAge);
  return this.find({
    sender,
    delivered: false,
    timestamp: { $gte: cutoffTime }
  })
  .sort({ timestamp: 1 })
  .lean();
};

// Middleware to update lastAttemptAt on save
messageSchema.pre('save', function(next) {
  if (this.isModified('attempts')) {
    this.lastAttemptAt = new Date();
  }
  
  // Update deliveredAt when message is marked as delivered
  if (this.isModified('delivered') && this.delivered) {
    this.deliveredAt = new Date();
  }
  
  next();
});

// Virtual for time since last attempt
messageSchema.virtual('timeSinceLastAttempt').get(function() {
  if (!this.lastAttemptAt) return null;
  return Date.now() - this.lastAttemptAt.getTime();
});

// Virtual for delivery duration
messageSchema.virtual('deliveryDuration').get(function() {
  if (!this.deliveredAt || !this.timestamp) return null;
  return this.deliveredAt.getTime() - this.timestamp.getTime();
});

// Add validation
messageSchema.path('attempts').validate(function(value) {
  const maxAttempts = parseInt(process.env.MESSAGE_MAX_ATTEMPTS) || 5;
  return value <= maxAttempts;
}, 'Maximum retry attempts exceeded');

// Method to check if message can be retried
messageSchema.methods.canRetry = function() {
  const maxAttempts = parseInt(process.env.MESSAGE_MAX_ATTEMPTS) || 5;
  return this.status !== MESSAGE_STATUS.DELIVERED && 
         this.attempts < maxAttempts;
};

// Method to get message state
messageSchema.methods.getState = function() {
  return {
    messageId: this.messageId,
    status: this.status,
    attempts: this.attempts,
    delivered: this.delivered,
    acknowledged: this.acknowledged,
    timestamp: this.timestamp,
    deliveryDuration: this.deliveryDuration,
    canRetry: this.canRetry(),
    error: this.error
  };
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
