require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/database');
const rabbitmq = require('./utils/rabbitmq');
const userService = require('./services/userService');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        service: 'user-service',
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime() 
    });
});

// Routes
const userRoutes = require('./routes/userRoutes');
app.use('/users', userRoutes);

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

const PORT = process.env.PORT || 3002;

// Initialize services
const initializeServices = async () => {
    try {
        await connectDB();
        await rabbitmq.connect();
        await userService.initializeEventHandlers();
        
        app.listen(PORT, () => {
            console.log(`User Service is running on port ${PORT}`);
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