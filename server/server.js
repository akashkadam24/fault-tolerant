require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const { 
  SERVER_CONFIG, 
  MONGODB_CONFIG 
} = require("./config/constants");
const WebSocketService = require("./services/WebSocket");
const messageQueueService = require("./services/RedisQueue");
const chatRoutes = require("./routes/chatRoutes");
const { logger, stream } = require("./utils/logger");

class Server {
  constructor() {
    this.app = express();
    this.createLogsDirectory();
    this.setupMiddleware();
    this.server = http.createServer(this.app);
    this.webSocketService = null;
    this.setupRoutes();
    this.setupErrorHandling();
  }

  createLogsDirectory() {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"]
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: SERVER_CONFIG.RATE_LIMIT.WINDOW_MS,
      max: SERVER_CONFIG.RATE_LIMIT.MAX_REQUESTS,
      message: {
        error: "Too many requests",
        retryAfter: "Please try again later"
      }
    });
    this.app.use(limiter);

    // Request parsing
    this.app.use(express.json({ limit: SERVER_CONFIG.BODY_LIMIT }));
    this.app.use(express.urlencoded({ extended: true }));

    // Logging
    this.app.use(morgan('combined', { stream }));

    // Request logging in development
    if (process.env.NODE_ENV === "development") {
      this.app.use((req, res, next) => {
        logger.debug(`${req.method} ${req.url}`);
        next();
      });
    }

    // Basic security headers
    this.app.use((req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("X-XSS-Protection", "1; mode=block");
      next();
    });
  }

  setupRoutes() {
    this.app.use("/api/chat", chatRoutes);

    // Health check route
    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
          websocket: this.webSocketService ? "initialized" : "not_initialized",
          redis: messageQueueService.queue.client ? "connected" : "disconnected"
        },
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version
      });
    });

    // Catch-all route
    this.app.use("*", (req, res) => {
      res.status(404).json({
        error: "Not Found",
        message: `Route ${req.originalUrl} not found`
      });
    });
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use((err, req, res, next) => {
      logger.error("Unhandled error:", err);
      
      const response = {
        error: "Internal Server Error",
        message: process.env.NODE_ENV === "development" ? err.message : "An unexpected error occurred",
        timestamp: new Date().toISOString()
      };

      if (process.env.NODE_ENV === "development") {
        response.stack = err.stack;
      }

      res.status(err.status || 500).json(response);
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (err) => {
      logger.error("Uncaught Exception:", err);
      this.gracefulShutdown(1);
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled Rejection at:", promise, "reason:", reason);
    });
  }

  async connectToMongoDB() {
    try {
      await mongoose.connect(process.env.MONGODB_URI || MONGODB_CONFIG.DEFAULT_URI, MONGODB_CONFIG.OPTIONS);
      logger.info("Connected to MongoDB");
    } catch (err) {
      logger.error("MongoDB connection error:", err);
      throw err;
    }
  }

  async start() {
    try {
      // Connect to MongoDB
      await this.connectToMongoDB();

      // Initialize WebSocket service
      this.webSocketService = new WebSocketService(this.server);

      // Start the server
      const port = process.env.PORT || SERVER_CONFIG.DEFAULT_PORT;
      this.server.listen(port, () => {
        logger.info(`Server running on port ${port}`);
        logger.info(`Environment: ${process.env.NODE_ENV}`);
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();
    } catch (err) {
      logger.error("Failed to start server:", err);
      this.gracefulShutdown(1);
    }
  }

  setupGracefulShutdown() {
    const signals = ["SIGTERM", "SIGINT"];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info(`\nReceived ${signal}, starting graceful shutdown...`);
        await this.gracefulShutdown(0);
      });
    });
  }

  async gracefulShutdown(code) {
    try {
      // Stop accepting new requests
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
          logger.info("Closed HTTP server");
        });
      }

      // Close WebSocket connections
      if (this.webSocketService) {
        // Notify clients about server shutdown
        this.webSocketService.io.emit("server_shutdown", {
          message: "Server is shutting down",
          timestamp: new Date().toISOString()
        });
        await new Promise((resolve) => {
          this.webSocketService.io.close(resolve);
          logger.info("Closed WebSocket connections");
        });
      }

      // Close MongoDB connection
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        logger.info("Closed MongoDB connection");
      }

      // Close Redis queue
      if (messageQueueService.queue) {
        await messageQueueService.queue.close();
        logger.info("Closed Redis queue");
      }

      logger.info("Graceful shutdown completed");
      process.exit(code);
    } catch (err) {
      logger.error("Error during graceful shutdown:", err);
      process.exit(1);
    }
  }
}

// Create and start server
const server = new Server();
server.start().catch((err) => {
  logger.error("Failed to start server:", err);
  process.exit(1);
});
