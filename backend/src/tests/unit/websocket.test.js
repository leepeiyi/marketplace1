// tests/unit/websocket.test.js
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { createServer } from "http";
import WebSocket from "ws";
import { WebSocketService } from "../../services/websocket.js";

describe("WebSocketService Unit Tests", () => {
  let wsService;
  let server;
  let mockWs;

  beforeEach(() => {
    wsService = new WebSocketService();
    server = createServer();

    // Mock WebSocket connection
    mockWs = {
      readyState: 1, // WebSocket.OPEN
      send: jest.fn(),
      on: jest.fn(),
      close: jest.fn(),
    };

    // Mock console methods to reduce noise
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (wsService.wss) {
      wsService.close();
    }
    if (server.listening) {
      server.close();
    }
    jest.restoreAllMocks();
  });

  describe("Constructor", () => {
    it("should initialize with empty connections and user types", () => {
      expect(wsService.wss).toBeNull();
      expect(wsService.connections.size).toBe(0);
      expect(wsService.userTypes.size).toBe(0);
    });
  });

  describe("initialize()", () => {
    it("should initialize WebSocket server", async () => {
      const port = await new Promise((resolve) => {
        server.listen(0, () => resolve(server.address().port));
      });

      wsService.initialize(server);

      expect(wsService.wss).toBeDefined();
      expect(wsService.isHealthy()).toBe(true);
    });
  });

  describe("handleMessage()", () => {
    beforeEach(() => {
      wsService.connections.set("user1", mockWs);
    });

    it("should handle authenticate message", () => {
      const authenticateSpy = jest
        .spyOn(wsService, "authenticateConnection")
        .mockImplementation();

      const message = {
        type: "authenticate",
        userId: "user1",
        userType: "customer",
      };

      wsService.handleMessage(mockWs, message);

      expect(authenticateSpy).toHaveBeenCalledWith(mockWs, message);
    });

    it("should handle ping message", () => {
      const message = { type: "ping" };

      wsService.handleMessage(mockWs, message);

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "pong" })
      );
    });

    it("should log unknown message types", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      const message = { type: "unknown" };

      wsService.handleMessage(mockWs, message);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Unknown message type:",
        "unknown"
      );
    });
  });

  describe("authenticateConnection()", () => {
    it("should authenticate valid connection", () => {
      const message = {
        userId: "user1",
        userType: "customer",
      };

      wsService.authenticateConnection(mockWs, message);

      expect(wsService.connections.get("user1")).toBe(mockWs);
      expect(wsService.userTypes.get("user1")).toBe("customer");
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "authenticated",
          userId: "user1",
          userType: "customer",
        })
      );
    });

    it("should reject authentication without userId", () => {
      const message = { userType: "customer" };

      wsService.authenticateConnection(mockWs, message);

      expect(wsService.connections.size).toBe(0);
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "error",
          message: "Missing userId or userType",
        })
      );
    });

    it("should reject authentication without userType", () => {
      const message = { userId: "user1" };

      wsService.authenticateConnection(mockWs, message);

      expect(wsService.connections.size).toBe(0);
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "error",
          message: "Missing userId or userType",
        })
      );
    });
  });

  describe("notifyCustomer()", () => {
    beforeEach(() => {
      wsService.connections.set("customer1", mockWs);
      wsService.userTypes.set("customer1", "customer");
    });

    it("should send notification to connected customer", () => {
      const data = {
        type: "bid_received",
        message: "You have a new bid",
      };

      wsService.notifyCustomer("customer1", data);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"bid_received"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"message":"You have a new bid"')
      );
    });

    it("should handle disconnected customer gracefully", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      wsService.notifyCustomer("nonexistent", { type: "test" });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Customer nonexistent not connected"
      );
    });

    it("should handle send errors", () => {
      mockWs.send.mockImplementation(() => {
        throw new Error("Connection closed");
      });

      const errorSpy = jest.spyOn(console, "error").mockImplementation();

      wsService.notifyCustomer("customer1", { type: "test" });

      expect(errorSpy).toHaveBeenCalled();
      expect(wsService.connections.has("customer1")).toBe(false);
    });

    it("should not send to closed connection", () => {
      mockWs.readyState = 3; // WebSocket.CLOSED

      wsService.notifyCustomer("customer1", { type: "test" });

      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  describe("notifyProvider()", () => {
    beforeEach(() => {
      wsService.connections.set("provider1", mockWs);
      wsService.userTypes.set("provider1", "provider");
    });

    it("should send notification to connected provider", () => {
      const data = {
        type: "new_job",
        job: { id: "job1", title: "Fix sink" },
      };

      wsService.notifyProvider("provider1", data);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"new_job"')
      );
    });

    it("should handle disconnected provider gracefully", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      wsService.notifyProvider("nonexistent", { type: "test" });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Provider nonexistent not connected"
      );
    });
  });

  describe("broadcast()", () => {
    beforeEach(() => {
      // Set up multiple connections
      const mockWs1 = { ...mockWs, send: jest.fn() };
      const mockWs2 = { ...mockWs, send: jest.fn() };
      const mockWs3 = { ...mockWs, send: jest.fn() };

      wsService.connections.set("customer1", mockWs1);
      wsService.connections.set("provider1", mockWs2);
      wsService.connections.set("customer2", mockWs3);

      wsService.userTypes.set("customer1", "customer");
      wsService.userTypes.set("provider1", "provider");
      wsService.userTypes.set("customer2", "customer");
    });

    it("should broadcast to all customers", () => {
      const data = { type: "system_announcement", message: "Maintenance" };

      const sentCount = wsService.broadcast("customer", data);

      expect(sentCount).toBe(2);

      const customer1Ws = wsService.connections.get("customer1");
      const customer2Ws = wsService.connections.get("customer2");

      expect(customer1Ws.send).toHaveBeenCalled();
      expect(customer2Ws.send).toHaveBeenCalled();
    });

    it("should broadcast to all providers", () => {
      const data = { type: "new_policy", message: "Updated terms" };

      const sentCount = wsService.broadcast("provider", data);

      expect(sentCount).toBe(1);

      const providerWs = wsService.connections.get("provider1");
      expect(providerWs.send).toHaveBeenCalled();
    });

    it("should handle broadcast errors", () => {
      const mockWsError = {
        ...mockWs,
        send: jest.fn().mockImplementation(() => {
          throw new Error("Send failed");
        }),
      };

      wsService.connections.set("error_user", mockWsError);
      wsService.userTypes.set("error_user", "customer");

      const sentCount = wsService.broadcast("customer", { type: "test" });

      // Should still send to other customers, just remove the erroring one
      expect(wsService.connections.has("error_user")).toBe(false);
      expect(wsService.userTypes.has("error_user")).toBe(false);
    });
  });

  describe("broadcastAll()", () => {
    beforeEach(() => {
      const mockWs1 = { ...mockWs, send: jest.fn() };
      const mockWs2 = { ...mockWs, send: jest.fn() };

      wsService.connections.set("user1", mockWs1);
      wsService.connections.set("user2", mockWs2);
    });

    it("should broadcast to all connected users", () => {
      const data = { type: "emergency", message: "Service disruption" };

      const sentCount = wsService.broadcastAll(data);

      expect(sentCount).toBe(2);

      wsService.connections.forEach((ws) => {
        expect(ws.send).toHaveBeenCalled();
      });
    });
  });

  describe("getStats()", () => {
    beforeEach(() => {
      wsService.connections.set("customer1", mockWs);
      wsService.connections.set("provider1", mockWs);
      wsService.connections.set("customer2", mockWs);

      wsService.userTypes.set("customer1", "customer");
      wsService.userTypes.set("provider1", "provider");
      wsService.userTypes.set("customer2", "customer");
    });

    it("should return accurate connection statistics", () => {
      const stats = wsService.getStats();

      expect(stats).toEqual({
        totalConnections: 3,
        activeConnections: 3,
      });
    });
  });

  describe("isHealthy()", () => {
    it("should return false when not initialized", () => {
      expect(wsService.isHealthy()).toBe(false);
    });

    it("should return true when initialized", async () => {
      const port = await new Promise((resolve) => {
        server.listen(0, () => resolve(server.address().port));
      });

      wsService.initialize(server);

      expect(wsService.isHealthy()).toBe(true);
    });
  });

  describe("close()", () => {
    it("should close WebSocket server and clear connections", async () => {
      const port = await new Promise((resolve) => {
        server.listen(0, () => resolve(server.address().port));
      });

      wsService.initialize(server);
      wsService.connections.set("user1", mockWs);
      wsService.userTypes.set("user1", "customer");

      wsService.close();

      expect(wsService.connections.size).toBe(0);
      expect(wsService.userTypes.size).toBe(0);
    });
  });
});
