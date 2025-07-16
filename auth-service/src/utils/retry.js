/**
 * Simple retry utility with exponential backoff
 */
class RetryUtil {
    static async retry(operation, options = {}) {
        const {
            maxAttempts = 10,
            initialDelay = 1000,
            maxDelay = 30000,
            serviceName = 'unknown'
        } = options;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                console.error(`[${serviceName}] Attempt ${attempt}/${maxAttempts} failed:`, error.message);
                
                if (attempt === maxAttempts) {
                    throw new Error(`Operation failed after ${maxAttempts} attempts: ${error.message}`);
                }
                
                const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
                console.log(`[${serviceName}] Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

module.exports = RetryUtil; 