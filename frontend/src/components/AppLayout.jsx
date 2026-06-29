import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, Avatar, Dropdown, Badge, Typography, theme } from 'antd'
import {
  DashboardOutlined, AppstoreOutlined, InboxOutlined, ShoppingCartOutlined,
  ShoppingOutlined, DollarOutlined, WalletOutlined, TeamOutlined,
  TruckOutlined, BarChartOutlined, PieChartOutlined, BellOutlined,
  SettingOutlined, SafetyOutlined, UserOutlined, LogoutOutlined,
  ShopOutlined, FileTextOutlined, ExperimentOutlined
} from '@ant-design/icons'
import api from '../api'
import ErrorBoundary from './ErrorBoundary'

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/masterdata', icon: <AppstoreOutlined />, label: 'Master Data' },
  { key: '/inventory', icon: <InboxOutlined />, label: 'Inventory' },
  { key: '/sales', icon: <ShoppingCartOutlined />, label: 'Sales' },
  { key: '/procurement', icon: <ShoppingOutlined />, label: 'Procurement' },
  { key: '/finance', icon: <DollarOutlined />, label: 'Finance' },
  { key: '/expenses', icon: <WalletOutlined />, label: 'Expenses' },
  { key: '/customers', icon: <TeamOutlined />, label: 'Customers' },
  { key: '/suppliers', icon: <ShopOutlined />, label: 'Suppliers' },
  { key: '/vehicles', icon: <TruckOutlined />, label: 'Vehicles' },
  { key: '/reports', icon: <FileTextOutlined />, label: 'Reports' },
  { key: '/analytics', icon: <PieChartOutlined />, label: 'Analytics' },
  { type: 'divider' },
  { key: '/iam', icon: <SafetyOutlined />, label: 'IAM' },
  { key: '/audit', icon: <ExperimentOutlined />, label: 'Audit' },
  { key: '/notifications', icon: <BellOutlined />, label: 'Notifications' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];

export default function AppLayout({ user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  React.useEffect(() => {
    api.get('/notifications?unread_only=true').then(res => setNotifCount(res.data.unread_count)).catch(() => {});
  }, [location]);

  const userMenu = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: user?.name || user?.email },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true },
    ],
    onClick: ({ key }) => { if (key === 'logout') onLogout(); }
  };

  const selectedKey = '/' + location.pathname.split('/').filter(Boolean)[0];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0' }}>
          <Text strong style={{ fontSize: collapsed ? 14 : 18, color: '#52c41a' }}>
            {collapsed ? 'M' : 'Manager ERP'}
          </Text>
        </div>
        <Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} onClick={({ key }) => navigate(key)} style={{ borderRight: 0 }} />
      </Sider>
      <Layout>
        <Header style={{ background: colorBgContainer, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderBottom: '1px solid #f0f0f0' }}>
          <Badge count={notifCount} size="small" style={{ marginRight: 16 }}>
            <Button type="text" icon={<BellOutlined />} onClick={() => navigate('/notifications')} />
          </Badge>
          <Dropdown menu={userMenu} placement="bottomRight">
            <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <Text>{user?.name || user?.email}</Text>
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 16, padding: 24, background: colorBgContainer, borderRadius: borderRadiusLG, minHeight: 360 }}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  );
}
