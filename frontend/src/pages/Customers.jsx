import React, { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Select, InputNumber, Space, message, Tag, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = () => { setLoading(true); api.get('/customers').then(r => setCustomers(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  return (<div>
    <Row gutter={[16,16]} style={{marginBottom:16}}>
      <Col span={8}><Card><Statistic title="Total Customers" value={customers.length} /></Card></Col>
      <Col span={8}><Card><Statistic title="Hotels" value={customers.filter(c => c.customer_type === 'hotel').length} /></Card></Col>
      <Col span={8}><Card><Statistic title="Outstanding" value={customers.reduce((s,c) => s + c.outstanding, 0)} prefix="₹" /></Card></Col>
    </Row>
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal(true)} style={{marginBottom:16}}>Add Customer</Button>
    <Table dataSource={customers} columns={[
      { title: 'Code', dataIndex: 'code' }, { title: 'Name', dataIndex: 'name' },
      { title: 'Phone', dataIndex: 'phone' }, { title: 'Type', dataIndex: 'customer_type', render: v => <Tag color={v === 'hotel' ? 'blue' : 'green'}>{v}</Tag> },
      { title: 'GSTIN', dataIndex: 'gstin' }, { title: 'Credit Limit', dataIndex: 'credit_limit', render: v => `₹${v}` },
      { title: 'Outstanding', dataIndex: 'outstanding', render: v => v > 0 ? <Tag color="orange">₹{v}</Tag> : <Tag>₹0</Tag> },
      { title: 'Status', dataIndex: 'is_active', render: v => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
      { render: (_, r) => <Button size="small" onClick={() => api.get(`/customers/${r.id}`).then(res => setDetail(res.data))}>View</Button> }
    ]} rowKey="id" loading={loading} size="small" />

    <Modal title="Add Customer" open={modal} onCancel={() => setModal(false)} footer={null} width={500}>
      <Form layout="vertical" onFinish={(v) => api.post('/customers', v).then(() => { message.success('Created'); setModal(false); load(); }).catch(e => message.error(e.response?.data?.error))}>
        <Form.Item name="code" label="Code" rules={[{required:true}]}><Input /></Form.Item>
        <Form.Item name="name" label="Name" rules={[{required:true}]}><Input /></Form.Item>
        <Form.Item name="phone" label="Phone"><Input /></Form.Item>
        <Form.Item name="customer_type" label="Type" initialValue="retail"><Select options={[{value:'retail',label:'Retail'},{value:'hotel',label:'Hotel'},{value:'corporate',label:'Corporate'}]} /></Form.Item>
        <Form.Item name="gstin" label="GSTIN"><Input /></Form.Item>
        <Form.Item name="credit_limit" label="Credit Limit"><InputNumber min={0} prefix="₹" style={{width:'100%'}} /></Form.Item>
        <Form.Item name="credit_days" label="Credit Days"><InputNumber min={0} /></Form.Item>
        <Form.Item name="address" label="Address"><Input.TextArea /></Form.Item>
        <Button type="primary" htmlType="submit" block>Create</Button>
      </Form>
    </Modal>

    <Modal title="Customer Detail" open={!!detail} onCancel={() => setDetail(null)} footer={null} width={700}>
      {detail && <>
        <p><strong>Name:</strong> {detail.name} | <strong>Type:</strong> {detail.customer_type} | <strong>Outstanding:</strong> ₹{detail.current_outstanding} / ₹{detail.credit_limit}</p>
        <p><strong>Contracts:</strong> {detail.contracts?.length} | <strong>Orders:</strong> {detail.orders?.length} | <strong>Invoices:</strong> {detail.invoices?.length}</p>
        <Table dataSource={detail.invoices?.slice(0,5)} rowKey="id" size="small" pagination={false}
          columns={[{title:'Invoice',dataIndex:'invoice_number'},{title:'Amount',dataIndex:'net_amount',render:v=>`₹${v}`},{title:'Status',dataIndex:'status',render:v=><Tag>{v}</Tag>},{title:'Due',dataIndex:'due_date',render:v=>dayjs(v).format('DD/MM')}]} />
      </>}
    </Modal>
  </div>);
}
