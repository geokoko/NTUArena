const healthService = require('../services/healthService');
const { validateServiceName } = require('../utils/validation');
const { logError } = require('../utils/logger');

class HealthController {
    async getGatewayHealth(req, res) {
        try {
            const health = await healthService.checkGatewayHealth();
            res.status(200).json(health);
        } catch (error) {
            logError(error, req);
            res.status(500).json({
                service: 'api-gateway',
                status: 'ERROR',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async getAllServicesHealth(req, res) {
        try {
            const health = await healthService.checkAllServicesHealth();
            
            // Determine overall status code based on service health
            const hasDownServices = Object.values(health.services).some(service => service.status === 'DOWN');
            const statusCode = hasDownServices ? 206 : 200; // 206 Partial Content if some services are down
            
            res.status(statusCode).json(health);
        } catch (error) {
            logError(error, req);
            res.status(500).json({
                gateway: 'ERROR',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async getServiceHealth(req, res) {
        try {
            const { serviceName } = req.params;
            const { services } = require('../config/services');
            
            // Validate service name
            if (!validateServiceName(serviceName)) {
                return res.status(404).json({
                    error: 'Service not found',
                    message: `Service '${serviceName}' is not available`,
                    availableServices: Object.keys(services),
                    timestamp: new Date().toISOString()
                });
            }

            const health = await healthService.checkServiceHealth(serviceName, services[serviceName]);
            
            // Set status code based on service health
            const statusCode = health.status === 'UP' ? 200 : 503;
            
            res.status(statusCode).json({
                service: serviceName,
                ...health
            });
        } catch (error) {
            logError(error, req);
            res.status(500).json({
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = new HealthController(); 