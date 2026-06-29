import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, Table, List, Tag, Typography, Spin, Alert, Button } from 'antd'
import { ShoppingCartOutlined, DollarOutlined, DeleteOutlined, WarningOutlined, RiseOutlined, ShopOutlined, TeamOutlined, InboxOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import api from '../api'

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then(res => setData(res.data)).catch(e => {
      const msg = e.response?.data?.message || e.message || 'Failed to load dashboard';
      setError(msg);
    }).finally(() => setLoading(false));
    api.get('/notifications/generate').catch(() => {});
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (error) return <Alert message={error} type="error" showIcon action={<Button size="small" onClick={() => window.location.reload()}>Retry</Button>} />;
  if (!data) return <Alert message="Could not load dashboard data" type="warning" />;

  const { today, alerts, financial, weekly_trend, top_products, store_sales, notifications } = data;

  const chartOption = {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: weekly_trend.map(d => d.date?.slice(5)) },
    yAxis: { type: 'value' },
    series: [{ data: weekly_trend.map(d => d.revenue), type: 'line', smooth: true, lineStyle: { color: '#52c41a' }, areaStyle: { color: 'rgba(82, 196, 26, 0.1)' } }]
  };

  return (
    <div>
      <Typography.Title level={4}>Dashboard</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Today's Retail Sales" value={today.retail_sales} prefix={<DollarOutlined />} suffix={<Typography.Text type="secondary">({today.retail_transactions} txns)</Typography.Text>} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Today's Hotel Sales" value={today.hotel_sales} prefix={<ShoppingCartOutlined />} suffix={<Typography.Text type="secondary">({today.hotel_orders} orders)</Typography.Text>} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Today's Purchases" value={today.purchases} prefix={<ShopOutlined />} valueStyle={{ color: '#faad14' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Today's Waste" value={today.waste} prefix={<DeleteOutlined />} valueStyle={{ color: '#ff4d4f' }} suffix={<Typography.Text type="secondary">({today.waste_records} records)</Typography.Text>} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Weekly Sales Trend">
            <ReactECharts option={chartOption} style={{ height: 250 }} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card title="Alerts">
            <List size="small" dataSource={[
              { icon: <WarningOutlined style={{ color: '#faad14' }} />, label: 'Expiring Stock', value: `${alerts.expiring_stock.qty} kg (₹${alerts.expiring_stock.value})` },
              { icon: <WarningOutlined style={{ color: '#ff4d4f' }} />, label: 'Low Stock Items', value: `${alerts.low_stock} items` },
              { icon: <WarningOutlined style={{ color: '#ff4d4f' }} />, label: 'Overdue Invoices', value: `${alerts.overdue_invoices} (₹${alerts.overdue_amount})` },
            ]} renderItem={item => <List.Item><span style={{ marginRight: 8 }}>{item.icon}</span><strong>{item.label}:</strong> {item.value}</List.Item>} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card title="Financial Summary">
            <List size="small" dataSource={[
              { label: 'Total Outstanding', value: `₹${financial.total_outstanding}` },
              { label: 'Stock Value (Cost)', value: `₹${financial.stock_value}` },
              { label: 'Total Revenue Today', value: `₹${today.total_revenue}`, strong: true },
            ]} renderItem={item => <List.Item><strong>{item.label}:</strong> <Tag color={item.strong ? 'green' : 'blue'}>{item.value}</Tag></List.Item>} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Today's Top Products" size="small">
            <Table dataSource={top_products} rowKey="code" pagination={false} size="small"
              columns={[
                { title: 'Product', dataIndex: 'name', key: 'name' },
                { title: 'Qty', dataIndex: 'qty', key: 'qty', render: v => `${Math.round(v)} kg` },
                { title: 'Revenue', dataIndex: 'revenue', key: 'revenue', render: v => `₹${v}` },
              ]} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Store Performance Today" size="small">
            <Table dataSource={store_sales} rowKey="name" pagination={false} size="small"
              columns={[
                { title: 'Store', dataIndex: 'name', key: 'name' },
                { title: 'Retail', dataIndex: 'retail', key: 'retail', render: v => `₹${v}` },
                { title: 'Hotel', dataIndex: 'hotel', key: 'hotel', render: v => `₹${v}` },
                { title: 'Total', key: 'total', render: (_, r) => <strong>₹{r.retail + r.hotel}</strong> },
              ]} />
          </Card>
        </Col>
      </Row>

      {notifications.length > 0 && (
        <Card title="Recent Notifications" size="small" style={{ marginTop: 16 }}>
          <List size="small" dataSource={notifications} renderItem={n => (
            <List.Item>
              <Tag color={n.type === 'error' ? 'red' : n.type === 'warning' ? 'orange' : 'blue'}>{n.type}</Tag>
              <strong>{n.title}</strong>: {n.message}
            </List.Item>
          )} />
        </Card>
      )}
    </div>
  );
}
