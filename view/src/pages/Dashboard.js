import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { healthAPI } from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const [serviceHealth, setServiceHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch service health
        const healthResponse = await healthAPI.checkServicesHealth();
        setServiceHealth(healthResponse.data);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="text-center">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Dashboard</h1>
      </div>

      <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {/* System Overview Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">System Overview</h3>
          </div>
          <div>
            <p><strong>Welcome to ArenaManager!</strong></p>
            <p>This is a tournament management system for competitive gaming.</p>
            <p>Use the navigation to explore tournaments and manage the system.</p>
          </div>
        </div>

        {/* Quick Actions Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Quick Actions</h3>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Link to="/tournaments" className="btn btn-primary">
              View Tournaments
            </Link>
            <Link to="/admin" className="btn btn-success">
              Admin Panel
            </Link>
          </div>
        </div>


      </div>

      {/* System Health Card */}
      <div className="card mt-4">
        <div className="card-header">
          <h3 className="card-title">System Health</h3>
        </div>
        <div>
          {serviceHealth ? (
            <div>
              <p><strong>Gateway:</strong> <span className="badge badge-success">{serviceHealth.gateway}</span></p>
              <div className="mt-3">
                <h4>Services Status:</h4>
                <div className="d-flex flex-wrap gap-2">
                  {Object.entries(serviceHealth.services).map(([serviceName, service]) => (
                    <span key={serviceName} className={`badge ${service.status === 'UP' ? 'badge-success' : 'badge-danger'}`}>
                      {serviceName}: {service.status}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <p><strong>Summary:</strong> {serviceHealth.summary?.up || 0} up, {serviceHealth.summary?.down || 0} down</p>
              </div>
            </div>
          ) : (
            <p className="text-muted">Health information not available</p>
          )}
        </div>
      </div>

      {/* Recent Activity Card */}
      <div className="card mt-4">
        <div className="card-header">
          <h3 className="card-title">Recent Activity</h3>
        </div>
        <div>
          <p className="text-muted">No recent activity to display</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 