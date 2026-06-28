import React, { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Select, InputNumber, Space, message, Tag, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/expenses'),
      api.get('/expenses/categories'),
      api.get('/masterdata/stores'),
    ]).then(([e, c, s]) => { setExpenses(e.data); setCategories(c.data); setStores(s.data); }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalThisMonth = expenses.filter(e => dayjs(e.expense_date).isAfter(dayjs().startOf('month'))).reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="This Month" value={totalThisMonth} prefix="₹" /></Card></Col>
        <Col span={6}><Card><Statistic title="Today" value={expenses.filter(e => dayjs(e.expense_date).isSame(dayjs(), 'day')).reduce((s, e) => s + e.amount, 0)} prefix="₹" /></Card></Col>
        <Col span={6}><Card><Statistic title="Categories" value={categories.length} /></Card></Col>
        <Col span={6}><Card><Statistic title="Avg/Day" value={Math.round(totalThisMonth / dayjs().diff(dayjs().startOf('month'), 'day') || 1)} prefix="₹" /></Card></Col>
      </Row>

      <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal(true)} style={{ marginBottom: 16 }}>Add Expense</Button>
      <Table dataSource={expenses} columns={[
        { title: 'Date', dataIndex: 'expense_date', render: v => dayjs(v).format('DD/MM') },
        { title: 'Category', dataIndex: 'category_name', render: v => <Tag>{v}</Tag> },
        { title: 'Description', dataIndex: 'description' },
        { title: 'Vendor', dataIndex: 'vendor_name' },
        { title: 'Amount', dataIndex: 'amount', render: v => <strong>₹{v}</strong> },
        { title: 'Payment', dataIndex: 'payment_method', render: v => <Tag>{v}</Tag> },
        { title: 'Store', dataIndex: 'store_name' },
        { title: 'Bill #', dataIndex: 'bill_number' },
      ]} rowKey="id" loading={loading} size="small" />

      <Modal title="Add Expense" open={modal} onCancel={() => setModal(false)} footer={null} width={500}>
        <Form layout="vertical" onFinish={(values) => api.post('/expenses', values).then(() => { message.success('Expense added'); setModal(false); load(); }).catch(err => message.error(err.response?.data?.error))}>
          <Form.Item name="store_id" label="Store" rules={[{ required: true }]}><Select options={stores.map(s => ({ value: s.id, label: s.name }))} /></Form.Item>
          <Form.Item name="category_id" label="Category" rules={[{ required: true }]}><Select options={categories.map(c => ({ value: c.id, label: c.name }))} /></Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><InputNumber min={1} prefix="₹" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="expense_date" label="Date"><Input placeholder="YYYY-MM-DD (default: today)" /></Form.Item>
          <Form.Item name="vendor_name" label="Vendor"><Input /></Form.Item>
          <Form.Item name="bill_number" label="Bill #"><Input /></Form.Item>
          <Form.Item name="payment_method" label="Payment" initialValue="cash"><Select options={[{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }]} /></Form.Item>
          <Button type="primary" htmlType="submit" block>Save Expense</Button>
        </Form>
      </Modal>
    </div>
  );
}
