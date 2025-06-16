import { parse } from 'url';

export class WebSocketService {
  constructor(io) {
    this.io = io;
    this.providers = new Map();
    this.customers = new Map();
  }

  handleConnection(socket) {
    const userId = this.getUserIdFromSocket(socket);
    const userType = this.getUserTypeFromSocket(socket);

    if (!userId || !userType) {
      socket.disconnect();
      return;
    }

    console.log(`${userType} ${userId} connected`);

    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        this.handleMessage(socket, userId, userType, data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    socket.on('disconnect', () => {
      this.handleDisconnection(userId, userType);
    });

    // Register connection
    if (userType === 'provider') {
      this.providers.set(userId, {
        socket,
        providerId: userId,
        isAvailable: true
      });
      
      // Join provider room
      socket.join(`provider_${userId}`);
    } else if (userType === 'customer') {
      this.customers.set(userId, {
        socket,
        customerId: userId
      });
      
      // Join customer room
      socket.join(`customer_${userId}`);
    }

    // Send connection confirmation
    this.sendToSocket(socket, {
      type: 'connected',
      userId,
      userType,
      timestamp: new Date().toISOString()
    });
  }

  handleMessage(socket, userId, userType, data) {
    switch (data.type) {
      case 'provider_availability':
        this.updateProviderAvailability(userId, data.isAvailable);
        break;
      case 'job_acceptance':
        this.handleJobAcceptance(userId, data.jobId);
        break;
      case 'ping':
        this.sendToSocket(socket, { 
          type: 'pong', 
          timestamp: new Date().toISOString() 
        });
        break;
      case 'location_update':
        if (userType === 'provider') {
          this.updateProviderLocation(userId, data.latitude, data.longitude);
        }
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }

  handleDisconnection(userId, userType) {
    console.log(`${userType} ${userId} disconnected`);
    
    if (userType === 'provider') {
      this.providers.delete(userId);
    } else if (userType === 'customer') {
      this.customers.delete(userId);
    }
  }

  // Broadcast new job to available providers within radius
  broadcastJobToProviders(job, providerIds) {
    console.log(`Broadcasting job ${job.id} to ${providerIds.length} providers`);
    
    providerIds.forEach(providerId => {
      const provider = this.providers.get(providerId);
      if (provider && provider.isAvailable) {
        this.sendToSocket(provider.socket, {
          type: 'new_job',
          job: {
            id: job.id,
            title: job.title,
            category: job.category.name,
            estimatedPrice: job.estimatedPrice,
            address: job.address,
            arrivalWindow: job.arrivalWindow,
            quickBookDeadline: job.quickBookDeadline,
            type: job.type,
            latitude: job.latitude,
            longitude: job.longitude
          },
          timestamp: new Date().toISOString()
        });
      }
    });

    // Also emit to all providers in the providers room
    this.io.to('providers').emit('job_broadcast', {
      type: 'new_job_available',
      jobId: job.id,
      category: job.category.name,
      estimatedPrice: job.estimatedPrice
    });
  }

  // Notify providers that job was taken
  notifyJobTaken(jobId, providerIds) {
    console.log(`Notifying ${providerIds.length} providers that job ${jobId} was taken`);
    
    providerIds.forEach(providerId => {
      const provider = this.providers.get(providerId);
      if (provider) {
        this.sendToSocket(provider.socket, {
          type: 'job_taken',
          jobId,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  // Notify customer of job status updates
  notifyCustomer(customerId, notification) {
    const customer = this.customers.get(customerId);
    if (customer) {
      this.sendToSocket(customer.socket, {
        ...notification,
        timestamp: new Date().toISOString()
      });
    }

    // Also emit to customer room
    this.io.to(`customer_${customerId}`).emit('notification', notification);
  }

  // Notify provider of bid updates
  notifyProvider(providerId, notification) {
    const provider = this.providers.get(providerId);
    if (provider) {
      this.sendToSocket(provider.socket, {
        ...notification,
        timestamp: new Date().toISOString()
      });
    }

    // Also emit to provider room
    this.io.to(`provider_${providerId}`).emit('notification', notification);
  }

  // Broadcast to all connected users
  broadcastToAll(data) {
    this.io.emit('broadcast', {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast to all providers
  broadcastToProviders(data) {
    this.providers.forEach(provider => {
      this.sendToSocket(provider.socket, {
        ...data,
        timestamp: new Date().toISOString()
      });
    });
  }

  // Broadcast to all customers
  broadcastToCustomers(data) {
    this.customers.forEach(customer => {
      this.sendToSocket(customer.socket, {
        ...data,
        timestamp: new Date().toISOString()
      });
    });
  }

  updateProviderAvailability(providerId, isAvailable) {
    const provider = this.providers.get(providerId);
    if (provider) {
      provider.isAvailable = isAvailable;
      console.log(`Provider ${providerId} availability updated: ${isAvailable}`);
    }
  }

  updateProviderLocation(providerId, latitude, longitude) {
    const provider = this.providers.get(providerId);
    if (provider) {
      provider.location = { latitude, longitude };
      console.log(`Provider ${providerId} location updated: ${latitude}, ${longitude}`);
    }
  }

  handleJobAcceptance(providerId, jobId) {
    console.log(`Provider ${providerId} attempting to accept job ${jobId}`);
    
    // Emit to job service or handle job acceptance logic
    this.io.emit('job_acceptance_attempt', {
      providerId,
      jobId,
      timestamp: new Date().toISOString()
    });
  }

  sendToSocket(socket, data) {
    try {
      if (socket && socket.connected) {
        socket.emit('message', data);
      }
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
    }
  }

  getUserIdFromSocket(socket) {
    // Extract from handshake headers or query
    const userId = socket.handshake.headers['x-user-id'] || 
                  socket.handshake.query['x-user-id'] ||
                  socket.handshake.auth?.userId;
    return userId;
  }

  getUserTypeFromSocket(socket) {
    // Extract from handshake headers or query
    const userType = socket.handshake.headers['x-user-type'] || 
                    socket.handshake.query['x-user-type'] ||
                    socket.handshake.auth?.userType;
    return userType;
  }

  // Get available providers for broadcasting
  getAvailableProviders() {
    return Array.from(this.providers.values())
      .filter(p => p.isAvailable)
      .map(p => p.providerId);
  }

  // Check if provider is online and available
  isProviderAvailable(providerId) {
    const provider = this.providers.get(providerId);
    return provider ? provider.isAvailable : false;
  }

  // Get connection stats
  getConnectionStats() {
    return {
      totalProviders: this.providers.size,
      availableProviders: this.getAvailableProviders().length,
      totalCustomers: this.customers.size,
      totalConnections: this.io.engine.clientsCount
    };
  }

  // Send system announcement to all users
  sendSystemAnnouncement(message, type = 'info') {
    this.broadcastToAll({
      type: 'system_announcement',
      message,
      level: type
    });
  }
}