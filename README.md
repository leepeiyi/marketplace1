# marketplace
# Quickly Marketplace - Full-Stack Technical Assessment

## Feature Overview

Quickly is a modern marketplace platform that connects customers with service providers through two distinct booking flows:

- **Quick Book (Instant Booking)**: One-tap hire for routine, urgent services with real-time provider matching and 30-second acceptance windows
- **Post & Quote (Controlled Bidding)**: Flexible bidding system with three-stage provider broadcasts, competitive pricing, and auto-hire capabilities

The platform features real-time WebSocket communication, intelligent bid ranking, escrow simulation, and comprehensive provider/customer dashboards.

## Local Spin-Up Steps

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for development)
- Git

### Quick Start
```bash
# Clone the repository
git clone https://github.com/leepeiyi/marketplace1.git

# Start all services with Docker Compose
docker-compose up

# Wait for services to initialize (30-60 seconds)
# Frontend: http://localhost:3000
# Backend API: http://localhost:3002
# Database: PostgreSQL on port 5432
```

### Manual Setup (Alternative)
```bash
# Backend setup
cd backend
npm install
npm run db:generate
npm run db:push
npm run start

# Frontend setup (new terminal)
cd frontend
```

### API Reference
Complete API Documentation
You can view the interactive documentation by:

Swagger UI: Copy docs/marketplace_documentation.yaml to Swagger Editor
Local Swagger: npx swagger-ui-serve docs/marketplace_documentation.yaml
Postman: Import the OpenAPI file for testing

## Test
```bash
npm test

#Run with coverage
npm run test:coverage

#Run specific test suites
npm run test:unit
npm run test:integration

#Run tests in watch mode
npm run test:watch
npm install
npm run dev
```


