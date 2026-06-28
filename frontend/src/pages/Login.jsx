import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, Typography, message, Space } from 'antd'
import { UserOutlined, LockOutlined, ShoppingOutlined } from '@ant-design/icons'
import api from '../api'

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', values);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      onLogin(res.data.user);
      message.success(`Welcome, ${res.data.user.fullName}!`);
      navigate('/');
    } catch (err) {
      message.error(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
          <ShoppingOutlined style={{ fontSize: 48, color: '#52c41a' }} />
          <Typography.Title level={3} style={{ margin: 0 }}>Manager ERP</Typography.Title>
          <Typography.Text type="secondary">Fresh Produce Management System</Typography.Text>
        </Space>
        <Form onFinish={onFinish} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item name="username" rules={[{ required: true, message: 'Please enter username' }]}>
            <Input prefix={<UserOutlined />} placeholder="Username" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Please enter password' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">Sign In</Button>
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12 }}>
            Default: admin / admin123
          </Typography.Text>
        </Form>
      </Card>
    </div>
  );
}
