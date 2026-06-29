import React, { useState, useEffect } from 'react'
import { Form, Input, InputNumber, Select, Button, message, Spin, Card, Row, Col, Typography, Divider } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import api from '../api'

export default function SettingsPage() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/settings').then(r => setSettings(Array.isArray(r?.data) ? r.data : [])).finally(() => setLoading(false));
  }, []);

  const grouped = {};
  settings.forEach(s => { if (!grouped[s.category]) grouped[s.category] = []; grouped[s.category].push(s); });

  const handleSave = async (values) => {
    try {
      const s = Object.entries(values).map(([key, value]) => ({ key, value }));
      await api.put('/settings', { settings: s });
      message.success('Settings saved');
    } catch (err) { message.error('Error saving'); }
  };

  if (loading) return <Spin style={{display:'block',margin:'100px auto'}} />;

  return (<div>
    <Typography.Title level={4}>Settings</Typography.Title>
    <Form layout="vertical" onFinish={handleSave} initialValues={settings.reduce((acc, s) => ({...acc, [s.setting_key]: s.setting_type === 'number' ? Number(s.setting_value) : s.setting_value}), {})}>
      {Object.entries(grouped).map(([category, items]) => (
        <Card key={category} title={category.charAt(0).toUpperCase() + category.slice(1)} style={{marginBottom:16}}>
          <Row gutter={[16,0]}>
            {items.map(s => (
              <Col span={8} key={s.setting_key}>
                <Form.Item name={s.setting_key} label={s.description || s.setting_key}>
                  {s.setting_type === 'number' ? <InputNumber style={{width:'100%'}} /> : s.setting_type === 'boolean' ?
                    <Select options={[{value:'1',label:'Yes'},{value:'0',label:'No'}]} /> : <Input />}
                </Form.Item>
              </Col>
            ))}
          </Row>
        </Card>
      ))}
      <Button type="primary" icon={<SaveOutlined />} htmlType="submit" size="large">Save All Settings</Button>
    </Form>
  </div>);
}
