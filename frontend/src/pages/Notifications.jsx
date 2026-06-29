import React, { useState, useEffect } from 'react'
import { List, Button, Tag, Typography, Space, Spin, Empty } from 'antd'
import { CheckOutlined, BellOutlined, WarningOutlined, InfoCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import api from '../api'

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      api.get('/notifications'),
      api.get('/notifications/generate'),
    ]).then(([n]) => {
      setNotifications(n?.data?.notifications || []);
      setUnread(n?.data?.unread_count || 0);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const iconMap = { warning: <WarningOutlined style={{color:'#faad14'}} />, error: <CloseCircleOutlined style={{color:'#ff4d4f'}} />, info: <InfoCircleOutlined style={{color:'#1890ff'}} />, success: <CheckOutlined style={{color:'#52c41a'}} /> };

  if (loading) return <Spin style={{display:'block',margin:'100px auto'}} />;

  return (<div>
    <Space style={{marginBottom:16}}>
      <Typography.Title level={4} style={{margin:0}}>Notifications</Typography.Title>
      {unread > 0 && <Tag color="red">{unread} unread</Tag>}
      {unread > 0 && <Button size="small" onClick={() => api.put('/notifications/read-all').then(load)}>Mark All Read</Button>}
      <Button size="small" onClick={load}>Refresh</Button>
    </Space>

    {notifications.length === 0 ? <Empty description="No notifications" /> :
      <List dataSource={notifications} renderItem={n => (
        <List.Item actions={!n.is_read ? [<Button size="small" onClick={() => api.put(`/notifications/${n.id}/read`).then(load)} icon={<CheckOutlined />}>Read</Button>] : []}
          style={{background: n.is_read ? 'transparent' : '#f6ffed', padding: '12px 16px', borderRadius: 6, marginBottom: 4}}>
          <List.Item.Meta
            avatar={iconMap[n.type] || <BellOutlined />}
            title={<Space><Tag color={n.type === 'error' ? 'red' : n.type === 'warning' ? 'orange' : n.type === 'success' ? 'green' : 'blue'}>{n.type}</Tag><strong>{n.title}</strong></Space>}
            description={<>{n.message}<br /><Typography.Text type="secondary" style={{fontSize:12}}>{n.created_at?.slice(0,19)}</Typography.Text></>}
          />
        </List.Item>
      )} />
    }
  </div>);
}
