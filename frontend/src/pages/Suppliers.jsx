import React, { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Select, InputNumber, message, Tag, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import api from '../api'

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = () => { setLoading(true); api.get('/suppliers').then(r => setSuppliers(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  return (<div>
    <Row gutter={[16,16]} style={{marginBottom:16}}>
      <Col span={8}><Card><Statistic title="Suppliers" value={suppliers.length} /></Card></Col>
      <Col span={8}><Card><Statistic title="Active" value={suppliers.filter(s => s.is_active).length} /></Card></Col>
      <Col span={8}><Card><Statistic title="Orders (30d)" value={suppliers.reduce((s, sp) => s + (sp.orders_30d || 0), 0)} /></Card></Col>
    </Row>
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal(true)} style={{marginBottom:16}}>Add Supplier</Button>
    <Table dataSource={suppliers} columns={[
      { title: 'Code', dataIndex: 'code' }, { title: 'Name', dataIndex: 'name' },
      { title: 'Contact', dataIndex: 'contact_person' }, { title: 'Phone', dataIndex: 'phone' },
      { title: 'City', dataIndex: 'city' }, { title: 'Terms', dataIndex: 'payment_terms', render: v => <Tag>{v}</Tag> },
      { title: 'Rating', dataIndex: 'rating', render: v => <Tag color={v >= 4 ? 'green' : v >= 3 ? 'blue' : 'orange'}>{v}/5</Tag> },
      { title: 'Orders (30d)', dataIndex: 'orders_30d' },
      { render: (_,r) => <Button size="small" onClick={() => api.get(`/suppliers/${r.id}`).then(res => setDetail(res.data))}>View</Button> }
    ]} rowKey="id" loading={loading} size="small" />

    <Modal title="Add Supplier" open={modal} onCancel={() => setModal(false)} footer={null} width={500}>
      <Form layout="vertical" onFinish={(v) => api.post('/suppliers', v).then(() => { message.success('Created'); setModal(false); load(); }).catch(e => message.error(e.response?.data?.error))}>
        <Form.Item name="code" label="Code" rules={[{required:true}]}><Input /></Form.Item>
        <Form.Item name="name" label="Name" rules={[{required:true}]}><Input /></Form.Item>
        <Form.Item name="contact_person" label="Contact Person"><Input /></Form.Item>
        <Form.Item name="phone" label="Phone"><Input /></Form.Item>
        <Form.Item name="city" label="City"><Input /></Form.Item>
        <Form.Item name="payment_terms" label="Payment Terms" initialValue="COD"><Select options={[{value:'COD',label:'COD'},{value:'weekly',label:'Weekly'},{value:'monthly',label:'Monthly'},{value:'credit',label:'Credit'}]} /></Form.Item>
        <Form.Item name="credit_days" label="Credit Days"><InputNumber min={0} /></Form.Item>
        <Form.Item name="gstin" label="GSTIN"><Input /></Form.Item>
        <Form.Item name="notes" label="Notes"><Input.TextArea /></Form.Item>
        <Button type="primary" htmlType="submit" block>Create</Button>
      </Form>
    </Modal>

    <Modal title="Supplier Detail" open={!!detail} onCancel={() => setDetail(null)} footer={null} width={700}>
      {detail && <>
        <p><strong>{detail.name}</strong> | {detail.city} | Rating: {detail.rating}/5 | Terms: {detail.payment_terms}</p>
        <p><strong>Produce:</strong> {detail.produce?.map(p => p.produce_name).join(', ')}</p>
        <Table dataSource={detail.purchase_orders?.slice(0,5)} rowKey="id" size="small" pagination={false}
          columns={[{title:'PO #',dataIndex:'po_number'},{title:'Total',dataIndex:'total_cost',render:v=>`₹${v}`},{title:'Status',dataIndex:'status',render:v=><Tag>{v}</Tag>},{title:'Date',dataIndex:'order_date',render:v=>v?.slice(0,10)}]} />
      </>}
    </Modal>
  </div>);
}
