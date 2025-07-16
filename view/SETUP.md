# Quick Setup Guide

## Prerequisites

1. Make sure you have Node.js (v14+) installed
2. Make sure the backend services are running (see main README)

## Setup Steps

1. **Navigate to the view directory**:
   ```bash
   cd view
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create environment file**:
   Create a `.env` file in the view directory with:
   ```env
   REACT_APP_API_URL=http://localhost:5000
   ```

4. **Start the development server**:
   ```bash
   npm start
   ```

5. **Open the app**:
   Visit `http://localhost:3000` in your browser

## Testing the Application

### Test User Login
- Try registering a new user
- Login with the credentials
- Explore the dashboard

### Test Admin Features
- Register a user with admin role (you might need to manually set this in the database)
- Access the admin dashboard
- Create tournaments
- Manage users

### Test Tournament Features
- Join tournaments
- View tournament details
- Check standings and games

## Default Test Data

The app includes some mock data for testing:
- Sample tournaments
- Mock user statistics
- Simulated health status

## Troubleshooting

1. **Port 3000 already in use**:
   ```bash
   npx kill-port 3000
   ```

2. **Dependencies issues**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **API connection issues**:
   - Check if backend services are running on port 5000
   - Verify the API Gateway is accessible

## Development Tips

- Use browser dev tools for debugging
- Check console for any errors
- Use React Developer Tools extension
- Test with different screen sizes for responsiveness 