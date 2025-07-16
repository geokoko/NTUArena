# API Gateway - Modular MVC Architecture

This API Gateway serves as the single entry point for all ArenaManager microservices, organized using Model-View-Controller (MVC) architecture patterns.

## 🏗️ Architecture Overview

The API Gateway is structured using a modular MVC approach:

```
src/
├── config/           # Configuration files
│   └── services.js   # Service URLs and routing configuration
├── controllers/      # Request handlers (Controller layer)
│   └── healthController.js
├── middleware/       # Custom middleware
│   ├── errorHandler.js
│   └── rateLimiter.js
├── routes/           # Route definitions
│   ├── index.js
│   └── healthRoutes.js
├── services/         # Business logic (Service layer)
│   ├── healthService.js
│   └── proxyService.js
├── utils/            # Utility functions
│   ├── logger.js
│   └── validation.js
└── server.js         # Main server file
```

## 🔧 Components

### Configuration (`config/`)
- **services.js**: Centralized service configuration including URLs and routing patterns

### Controllers (`controllers/`)
- **healthController.js**: Handles health check endpoints, validates requests, and formats responses

### Middleware (`middleware/`)
- **errorHandler.js**: Global error handling with proper logging and sanitization
- **rateLimiter.js**: Rate limiting configurations for different endpoint types

### Routes (`routes/`)
- **index.js**: Main router combining all route modules
- **healthRoutes.js**: Health check specific routes

### Services (`services/`)
- **healthService.js**: Business logic for health checks with parallel processing
- **proxyService.js**: Proxy configuration and management

### Utilities (`utils/`)
- **logger.js**: Winston-based logging with structured output
- **validation.js**: Request validation and data sanitization utilities

## 🚀 Features

### Health Monitoring
- **Gateway Health**: `/health` - Check API Gateway status
- **All Services**: `/health/services` - Check all microservices health
- **Individual Service**: `/health/services/:serviceName` - Check specific service

### Security
- Rate limiting with different tiers
- Error message sanitization
- CORS configuration
- Helmet security headers

### Logging
- Structured logging with Winston
- Request/response logging
- Error tracking with context

### Validation
- Request validation middleware
- Service name validation
- URL and port validation

## 🔌 API Endpoints

### Health Endpoints
```
GET /health                        # Gateway health
GET /health/services               # All services health
GET /health/services/:serviceName  # Individual service health
```

### Proxy Endpoints
```
/api/auth/*        → auth-service:3001
/api/users/*       → user-service:3002
/api/tournaments/* → tournament-service:3003
/api/players/*     → player-service:3004
/api/games/*       → game-service:3005
/api/pairing/*     → pairing-service:3006
```

## 📝 Configuration

### Environment Variables
```bash
# Server
PORT=5000
NODE_ENV=development
LOG_LEVEL=info

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Service URLs
AUTH_SERVICE_URL=http://auth-service:3001
USER_SERVICE_URL=http://user-service:3002
TOURNAMENT_SERVICE_URL=http://tournament-service:3003
PLAYER_SERVICE_URL=http://player-service:3004
GAME_SERVICE_URL=http://game-service:3005
PAIRING_SERVICE_URL=http://pairing-service:3006
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Development with auto-restart
npm run dev
```

## 🔍 Health Check Response Format

```json
{
  "service": "api-gateway",
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "development"
}
```

## 📊 Service Health Summary

```json
{
  "gateway": "UP",
  "services": {
    "auth": {
      "status": "UP",
      "url": "http://auth-service:3001",
      "responseTime": 1640995200000,
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  },
  "summary": {
    "total": 6,
    "up": 5,
    "down": 1,
    "checkDuration": "150ms"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🛠️ Development

### Adding New Services
1. Update `config/services.js` with new service URL and route
2. Proxy will automatically be configured
3. Add service name to validation in `utils/validation.js`

### Adding New Endpoints
1. Create controller in `controllers/`
2. Create route module in `routes/`
3. Import and use in `routes/index.js`

### Custom Middleware
1. Create middleware in `middleware/`
2. Import and use in routes or server.js

## 📝 Logging

Logs are structured and include:
- Request/response details
- Error context
- Performance metrics
- Security events

In production, logs are written to files:
- `logs/error.log` - Error logs only
- `logs/combined.log` - All logs

## 🔐 Security Features

- Rate limiting per endpoint type
- Error message sanitization
- CORS configuration
- Security headers via Helmet
- Request validation
- Graceful error handling

## 📈 Performance

- Parallel health checks
- Connection pooling for proxies
- Request timeout handling
- Efficient error handling
- Structured logging 