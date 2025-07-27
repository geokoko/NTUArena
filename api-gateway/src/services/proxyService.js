const http = require('http');
const https = require('https');
const url = require('url');

class ProxyService {
	constructor() {
		this.serviceRoutes = {};
	}

	setupProxyRoutes(app, serviceRoutes) {
		this.serviceRoutes = serviceRoutes;

		Object.entries(serviceRoutes).forEach(([serviceName, config]) => {
			app.use(config.path, this.createSimpleProxy.bind(this, config));
			console.log(`Simple proxy configured: ${config.path} -> ${config.target}`);
		});
	}

	createSimpleProxy(config, req, res) {
		const targetUrl = url.parse(config.target);
		const pathRewrite = config.pathRewrite || {};

		// Apply path rewriting
		let targetPath = req.url;
		Object.entries(pathRewrite).forEach(([pattern, replacement]) => {
			const regex = new RegExp(pattern);
			targetPath = targetPath.replace(regex, replacement);
		});

		const options = {
			hostname: targetUrl.hostname,
			port: targetUrl.port,
			path: targetPath,
			method: req.method,
			headers: {
				...req.headers,
				host: targetUrl.hostname
			}
		};

		console.log(`[PROXY] ${req.method} ${req.url} -> ${targetUrl.protocol}//${targetUrl.host}${targetPath}`);

		const proxyReq = http.request(options, (proxyRes) => {
			console.log(`[PROXY] Response: ${proxyRes.statusCode} for ${req.method} ${req.url}`);

			// Add CORS headers
			proxyRes.headers['Access-Control-Allow-Origin'] = '*';
			proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
			proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';

			res.writeHead(proxyRes.statusCode, proxyRes.headers);
			proxyRes.pipe(res);
		});

		proxyReq.on('error', (err) => {
			console.error('Proxy error:', err);
			if (!res.headersSent) {
				res.status(502).json({ 
					error: 'Bad Gateway',
					message: 'Service temporarily unavailable',
					details: process.env.NODE_ENV === 'development' ? err.message : undefined
				});
			}
		});

		// Set timeout
		proxyReq.setTimeout(60000, () => {
			console.error('Proxy timeout for:', req.url);
			proxyReq.destroy();
			if (!res.headersSent) {
				res.status(504).json({ 
					error: 'Gateway Timeout',
					message: 'Service request timed out'
				});
			}
		});

		// Pipe request body
		req.pipe(proxyReq);
	}
}

module.exports = new ProxyService(); 
