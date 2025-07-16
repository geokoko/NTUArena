require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/database');
const rabbitmq = require('./utils/rabbitmq');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request timeout middleware
app.use((req, res, next) => {
    req.setTimeout(30000, () => {
        console.error('Request timeout for:', req.url);
        if (!res.headersSent) {
            res.status(408).json({ 
                error: 'Request Timeout',
                message: 'Request took too long to process'
            });
        }
    });
    next();
});

// Logging
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        service: 'auth-service',
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime() 
    });
});

// Routes
const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(error.status || 500).json({
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message
    });
});

const PORT = process.env.PORT || 3001;

// Initialize services
const initializeServices = async () => {
    try {
        await connectDB();
        await rabbitmq.connect();
        
        app.listen(PORT, () => {
            console.log(`Auth Service is running on port ${PORT}`);
            console.log(`Health check available at http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('Failed to initialize services:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await rabbitmq.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await rabbitmq.close();
    process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    console.error('Unhandled Promise Rejection:', err);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

initializeServices(); 