// services/websocket.js
import { WebSocketServer } from "ws";

class WebSocketService {
  constructor() {
    this.wss = null;
    this.connections = new Map(); // userId -> WebSocket connection
    this.userTypes = new Map(); // userId -> 'customer' or 'provider'
  }

  initialize(server) {
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
    });

    this.wss.on("connection", (ws, request) => {
      console.log("New WebSocket connection");

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error("Invalid WebSocket message:", error);
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid message format",
            })
          );
        }
      });

      ws.on("close", () => {
        // Find and remove the connection
        for (const [userId, connection] of this.connections.entries()) {
          if (connection === ws) {
            this.connections.delete(userId);
            this.userTypes.delete(userId);
            console.log(`User ${userId} disconnected`);
            break;
          }
        }
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
      });

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: "connected",
          message: "WebSocket connection established",
        })
      );
    });

    console.log("WebSocket server initialized");
  }

  handleMessage(ws, message) {
    switch (message.type) {
      case "authenticate":
        this.authenticateConnection(ws, message);
        break;
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      default:
        console.log("Unknown message type:", message.type);
    }
  }

  authenticateConnection(ws, message) {
    const { userId, userType } = message;

    if (!userId || !userType) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Missing userId or userType",
        })
      );
      return;
    }

    // Store the connection
    this.connections.set(userId, ws);
    this.userTypes.set(userId, userType);

    ws.send(
      JSON.stringify({
        type: "authenticated",
        userId,
        userType,
      })
    );

    console.log(`User ${userId} (${userType}) authenticated`);
  }

  // Notify a specific customer
  notifyCustomer(customerId, data) {
    const connection = this.connections.get(customerId);
    if (connection && connection.readyState === 1) {
      // WebSocket.OPEN
      try {
        connection.send(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            ...data,
          })
        );
        console.log(`Notification sent to customer ${customerId}:`, data.type);
      } catch (error) {
        console.error(
          `Error sending notification to customer ${customerId}:`,
          error
        );
        this.connections.delete(customerId);
      }
    } else {
      console.log(`Customer ${customerId} not connected`);
    }
  }

  // Notify a specific provider
  notifyProvider(providerId, data) {
    const connection = this.connections.get(providerId);
    if (connection && connection.readyState === 1) {
      // WebSocket.OPEN
      try {
        connection.send(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            ...data,
          })
        );
        console.log(`Notification sent to provider ${providerId}:`, data.type);
      } catch (error) {
        console.error(
          `Error sending notification to provider ${providerId}:`,
          error
        );
        this.connections.delete(providerId);
      }
    } else {
      console.log(`Provider ${providerId} not connected`);
    }
  }

  // Broadcast to all users of a specific type
  broadcast(userType, data) {
    let sentCount = 0;

    for (const [userId, connection] of this.connections.entries()) {
      const connectionUserType = this.userTypes.get(userId);

      if (connectionUserType === userType && connection.readyState === 1) {
        try {
          connection.send(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              ...data,
            })
          );
          sentCount++;
        } catch (error) {
          console.error(`Error broadcasting to ${userType} ${userId}:`, error);
          this.connections.delete(userId);
          this.userTypes.delete(userId);
        }
      }
    }

    console.log(`Broadcast sent to ${sentCount} ${userType}s:`, data.type);
    return sentCount;
  }

  // Broadcast to all connected users
  broadcastAll(data) {
    let sentCount = 0;

    for (const [userId, connection] of this.connections.entries()) {
      if (connection.readyState === 1) {
        try {
          connection.send(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              ...data,
            })
          );
          sentCount++;
        } catch (error) {
          console.error(`Error broadcasting to user ${userId}:`, error);
          this.connections.delete(userId);
          this.userTypes.delete(userId);
        }
      }
    }

    console.log(`Broadcast sent to ${sentCount} users:`, data.type);
    return sentCount;
  }

  // Get connection stats
  getStats() {
    return {
      totalConnections: this.totalConnections || 0,
      activeConnections: this.connections
        ? Object.keys(this.connections).length
        : 0,
    };
  }

  // Health check
  isHealthy() {
    return this.wss !== null;
  }

  // Close all connections
  close() {
    if (this.wss) {
      this.wss.close();
      this.connections.clear();
      this.userTypes.clear();
      console.log("WebSocket server closed");
    }
  }
}

export { WebSocketService };
