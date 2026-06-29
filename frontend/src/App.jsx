import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Spin, Alert, Button } from 'antd'
import api from './api'
import AppLayout from './components/AppLayout'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MasterData from './pages/MasterData'
import Inventory from './pages/Inventory'
import Sales from './pages/Sales'
import Procurement from './pages/Procurement'
import Finance from './pages/Finance'
import Expenses from './pages/Expenses'
import Customers from './pages/Customers'
import Suppliers from './pages/Suppliers'
import Vehicles from './pages/Vehicles'
import Reports from './pages/Reports'
import Analytics from './pages/Analytics'
import IAM from './pages/IAM'
import Audit from './pages/Audit'
import SettingsPage from './pages/Settings'
import Notifications from './pages/Notifications'

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function clearAuthStorage() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      const timeoutId = setTimeout(() => {
        setError('Server is not responding. Please ensure the backend is running.');
        setLoading(false);
      }, 8000);
      api.post('/auth/verify', { token }).then(res => {
        clearTimeout(timeoutId);
        if (res.data && res.data.valid) { setUser(res.data.user); } else { clearAuthStorage(); }
      }).catch(() => {
        clearTimeout(timeoutId);
      }).finally(() => {
        clearTimeout(timeoutId);
        setLoading(false);
      });
    } else { setLoading(false); }
  }, []);

  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', height:'100vh', gap: 16 }}>
      <Spin size="large" />
      {error && <Alert message={error} type="error" showIcon action={<Button size="small" onClick={() => window.location.reload()}>Retry</Button>} />}
    </div>
  );

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login onLogin={(u) => setUser(u)} />} />
        <Route path="/" element={<ProtectedRoute><AppLayout user={user} onLogout={() => { setUser(null); clearAuthStorage(); }} /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="masterdata/*" element={<MasterData />} />
          <Route path="inventory/*" element={<Inventory />} />
          <Route path="sales/*" element={<Sales />} />
          <Route path="procurement/*" element={<Procurement />} />
          <Route path="finance/*" element={<Finance />} />
          <Route path="expenses/*" element={<Expenses />} />
          <Route path="customers/*" element={<Customers />} />
          <Route path="suppliers/*" element={<Suppliers />} />
          <Route path="vehicles/*" element={<Vehicles />} />
          <Route path="reports/*" element={<Reports />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="iam/*" element={<IAM />} />
          <Route path="audit" element={<Audit />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
