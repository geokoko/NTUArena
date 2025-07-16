const request = require('supertest');
const app = require('../server');

describe('Health Controller', () => {
    describe('GET /health', () => {
        it('should return gateway health status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body).toHaveProperty('service', 'api-gateway');
            expect(response.body).toHaveProperty('status', 'OK');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('uptime');
            expect(response.body).toHaveProperty('version');
            expect(response.body).toHaveProperty('environment');
        });
    });

    describe('GET /health/services', () => {
        it('should return all services health status', async () => {
            const response = await request(app)
                .get('/health/services')
                .expect((res) => {
                    // Should return 200 or 206 (partial content)
                    expect([200, 206]).toContain(res.status);
                });

            expect(response.body).toHaveProperty('gateway', 'UP');
            expect(response.body).toHaveProperty('services');
            expect(response.body).toHaveProperty('summary');
            expect(response.body).toHaveProperty('timestamp');
            
            // Check summary structure
            expect(response.body.summary).toHaveProperty('total');
            expect(response.body.summary).toHaveProperty('up');
            expect(response.body.summary).toHaveProperty('down');
            expect(response.body.summary).toHaveProperty('checkDuration');
        });
    });

    describe('GET /health/services/:serviceName', () => {
        it('should return specific service health status', async () => {
            const response = await request(app)
                .get('/health/services/auth')
                .expect((res) => {
                    // Should return 200 or 503 based on service status
                    expect([200, 503]).toContain(res.status);
                });

            expect(response.body).toHaveProperty('service', 'auth');
            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('url');
            expect(response.body).toHaveProperty('timestamp');
        });

        it('should return 404 for invalid service name', async () => {
            const response = await request(app)
                .get('/health/services/invalid-service')
                .expect(404);

            expect(response.body).toHaveProperty('error', 'Service not found');
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('availableServices');
        });
    });

    describe('GET /', () => {
        it('should return API information', async () => {
            const response = await request(app)
                .get('/')
                .expect(200);

            expect(response.body).toHaveProperty('name', 'ArenaManager API Gateway');
            expect(response.body).toHaveProperty('version', '1.0.0');
            expect(response.body).toHaveProperty('description');
            expect(response.body).toHaveProperty('endpoints');
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for non-existent routes', async () => {
            const response = await request(app)
                .get('/non-existent-route')
                .expect(404);

            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('status', 404);
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('path', '/non-existent-route');
        });
    });
}); 