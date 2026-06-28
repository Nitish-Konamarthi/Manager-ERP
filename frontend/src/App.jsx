import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import api from './api'
import AppLayout from './components/AppLayout'
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

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.post('/auth/verify', { token }).then(res => {
        if (res.data.valid) { setUser(res.data.user); } else { localStorage.removeItem('token'); }
      }).catch(() => { localStorage.removeItem('token'); }).finally(() => setLoading(false));
    } else { setLoading(false); }
  }, []);

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}><Spin size="large" /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login onLogin={(u) => setUser(u)} />} />
      <Route path="/" element={<ProtectedRoute><AppLayout user={user} onLogout={() => { setUser(null); localStorage.removeItem('token'); }} /></ProtectedRoute>}>
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
  );
}
