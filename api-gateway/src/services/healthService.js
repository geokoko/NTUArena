const { services } = require('../config/services');
const { validateHealthResponse, sanitizeErrorMessage } = require('../utils/validation');

class HealthService {
    async checkGatewayHealth() {
        return {
            service: 'api-gateway',
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        };
    }

    async checkServiceHealth(serviceName, serviceUrl) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(`${serviceUrl}/health`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'api-gateway-health-check'
                }
            });
            
            clearTimeout(timeoutId);
            
            const responseData = await response.json();
            
            const healthData = {
                status: response.ok ? 'UP' : 'DOWN',
                url: serviceUrl,
                responseTime: Date.now(),
                timestamp: new Date().toISOString()
            };
            
            // Validate response format
            if (validateHealthResponse(responseData)) {
                healthData.serviceInfo = {
                    status: responseData.status,
                    uptime: responseData.uptime,
                    version: responseData.version || 'unknown'
                };
            }
            
            return healthData;
        } catch (error) {
            return {
                status: 'DOWN',
                url: serviceUrl,
                error: sanitizeErrorMessage(error.message),
                timestamp: new Date().toISOString()
            };
        }
    }

    async checkAllServicesHealth() {
        const healthChecks = {};
        const startTime = Date.now();
        
        // Check all services in parallel
        const healthPromises = Object.entries(services).map(async ([serviceName, serviceUrl]) => {
            const health = await this.checkServiceHealth(serviceName, serviceUrl);
            return { serviceName, health };
        });
        
        const results = await Promise.all(healthPromises);
        
        // Organize results
        results.forEach(({ serviceName, health }) => {
            healthChecks[serviceName] = health;
        });
        
        const endTime = Date.now();
        const upServices = Object.values(healthChecks).filter(h => h.status === 'UP').length;
        const totalServices = Object.keys(healthChecks).length;
        
        return {
            gateway: 'UP',
            services: healthChecks,
            summary: {
                total: totalServices,
                up: upServices,
                down: totalServices - upServices,
                checkDuration: `${endTime - startTime}ms`
            },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new HealthService(); 