import React, { useState, useEffect } from 'react'
import { Table, Select, Input, Space, Tag, Typography, Card, Row, Col, Statistic } from 'antd'
import api from '../api'

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({});

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/audit', { params: filters }),
      api.get('/audit/summary'),
    ]).then(([l, s]) => { setLogs(Array.isArray(l?.data) ? l.data : []); setSummary(s?.data || null); }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters]);

  return (<div>
    {summary && <Row gutter={[16,16]} style={{marginBottom:16}}>
      <Col span={6}><Card><Statistic title="Total (7d)" value={summary.total?.total} /></Card></Col>
      <Col span={6}><Card><Statistic title="Modules Active" value={summary.by_module?.length} /></Card></Col>
      <Col span={6}><Card><Statistic title="Top Module" value={summary.by_module?.[0]?.module || '-'} /></Card></Col>
      <Col span={6}><Card><Statistic title="Top Action" value={summary.by_action?.[0]?.action || '-'} /></Card></Col>
    </Row>}

    <Space style={{marginBottom:16}}>
      <Select placeholder="Module" allowClear style={{width:150}} value={filters.module} onChange={v => setFilters({...filters, module: v})}
        options={summary?.by_module?.map(m => ({value:m.module, label:m.module})) || []} />
      <Select placeholder="Action" allowClear style={{width:150}} value={filters.action} onChange={v => setFilters({...filters, action: v})}
        options={summary?.by_action?.map(a => ({value:a.action, label:a.action})) || []} />
      <Input placeholder="User ID" style={{width:150}} value={filters.user_id} onChange={e => setFilters({...filters, user_id: e.target.value})} />
    </Space>

    <Table dataSource={logs} rowKey="id" loading={loading} size="small"
      columns={[
        {title:'Time',dataIndex:'created_at',render:v=>v?.slice(0,19)},
        {title:'User',dataIndex:'user_name'},
        {title:'Action',dataIndex:'action',render:v=><Tag>{v}</Tag>},
        {title:'Module',dataIndex:'module',render:v=><Tag color="blue">{v}</Tag>},
        {title:'Entity',dataIndex:'entity_type'},{title:'Entity ID',dataIndex:'entity_id'},
      ]} />
  </div>);
}
