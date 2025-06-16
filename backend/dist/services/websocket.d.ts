export class WebSocketService {
    constructor(io: any);
    io: any;
    providers: Map<any, any>;
    customers: Map<any, any>;
    handleConnection(socket: any): void;
    handleMessage(socket: any, userId: any, userType: any, data: any): void;
    handleDisconnection(userId: any, userType: any): void;
    broadcastJobToProviders(job: any, providerIds: any): void;
    notifyJobTaken(jobId: any, providerIds: any): void;
    notifyCustomer(customerId: any, notification: any): void;
    notifyProvider(providerId: any, notification: any): void;
    broadcastToAll(data: any): void;
    broadcastToProviders(data: any): void;
    broadcastToCustomers(data: any): void;
    updateProviderAvailability(providerId: any, isAvailable: any): void;
    updateProviderLocation(providerId: any, latitude: any, longitude: any): void;
    handleJobAcceptance(providerId: any, jobId: any): void;
    sendToSocket(socket: any, data: any): void;
    getUserIdFromSocket(socket: any): any;
    getUserTypeFromSocket(socket: any): any;
    getAvailableProviders(): any[];
    isProviderAvailable(providerId: any): any;
    getConnectionStats(): {
        totalProviders: number;
        availableProviders: number;
        totalCustomers: number;
        totalConnections: any;
    };
    sendSystemAnnouncement(message: any, type?: string): void;
}
//# sourceMappingURL=websocket.d.ts.map