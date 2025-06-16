import { SocketStream } from '@fastify/websocket';
import { FastifyRequest } from 'fastify';

interface ConnectedProvider {
  socket: SocketStream;
  providerId: string;
  isAvailable: boolean;
}

interface ConnectedCustomer {
  socket: SocketStream;
  customerId: string;
}

export class WebSocketService {
  private providers = new Map<string, ConnectedProvider>();
  private customers = new Map<string, ConnectedCustomer>();

  handleConnection(connection: SocketStream, request: FastifyRequest) {
    const userId = this.getUserIdFromRequest(request);
    const userType = this.getUserTypeFromRequest(request);

    if (!userId || !userType) {
      connection.socket.close();
      return;
    }

    connection.socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        this.handleMessage(connection, userId, userType, data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    connection.socket.on('close', () => {
      this.handleDisconnection(userId, userType);
    });

    // Register connection
    if (userType === 'provider') {
      this.providers.set(userId, {
        socket: connection,
        providerId: userId,
        isAvailable: true
      });
    } else if (userType === 'customer') {
      this.customers.set(userId, {
        socket: connection,
        customerId: userId
      });
    }

    // Send connection confirmation
    this.sendToSocket(connection, {
      type: 'connected',
      userId,
      userType
    });
  }

  private handleMessage(connection: SocketStream, userId: string, userType: string, data: any) {
    switch (data.type) {
      case 'provider_availability':
        this.updateProviderAvailability(userId, data.isAvailable);
        break;
      case 'job_acceptance':
        this.handleJobAcceptance(userId, data.jobId);
        break;
      case 'ping':
        this.sendToSocket(connection, { type: 'pong' });
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }

  private handleDisconnection(userId: string, userType: string) {
    if (userType === 'provider') {
      this.providers.delete(userId);
    } else if (userType === 'customer') {
      this.customers.delete(userId);
    }
  }

  // Broadcast new job to available providers within radius
  broadcastJobToProviders(job: any, providerIds: string[]) {
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
            type: job.type
          }
        });
      }
    });
  }

  // Notify providers that job was taken
  notifyJobTaken(jobId: string, providerIds: string[]) {
    providerIds.forEach(providerId => {
      const provider = this.providers.get(providerId);
      if (provider) {
        this.sendToSocket(provider.socket, {
          type: 'job_taken',
          jobId
        });
      }
    });
  }

  // Notify customer of job status updates
  notifyCustomer(customerId: string, notification: any) {
    const customer = this.customers.get(customerId);
    if (customer) {
      this.sendToSocket(customer.socket, notification);
    }
  }

  // Notify provider of bid updates
  notifyProvider(providerId: string, notification: any) {
    const provider = this.providers.get(providerId);
    if (provider) {
      this.sendToSocket(provider.socket, notification);
    }
  }

  private updateProviderAvailability(providerId: string, isAvailable: boolean) {
    const provider = this.providers.get(providerId);
    if (provider) {
      provider.isAvailable = isAvailable;
    }
  }

  private handleJobAcceptance(providerId: string, jobId: string) {
    // This will be handled by the job service
    // Just emit an event that can be caught by the job controller
    console.log(`Provider ${providerId} accepting job ${jobId}`);
  }

  private sendToSocket(connection: SocketStream, data: any) {
    try {
      connection.socket.send(JSON.stringify(data));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
    }
  }

  private getUserIdFromRequest(request: FastifyRequest): string | null {
    // In a real app, you'd extract this from JWT token
    // For now, we'll use a header
    return request.headers['x-user-id'] as string || null;
  }

  private getUserTypeFromRequest(request: FastifyRequest): string | null {
    // In a real app, you'd extract this from JWT token
    // For now, we'll use a header
    return request.headers['x-user-type'] as string || null;
  }

  // Get available providers for broadcasting
  getAvailableProviders(): string[] {
    return Array.from(this.providers.values())
      .filter(p => p.isAvailable)
      .map(p => p.providerId);
  }

  // Check if provider is online and available
  isProviderAvailable(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    return provider ? provider.isAvailable : false;
  }
}