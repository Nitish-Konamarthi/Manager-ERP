import React, { useState, useEffect, useCallback } from 'react'
import { Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, DatePicker, Space, message, Tag, Card, Row, Col, Statistic, Descriptions, Divider, Typography, Alert, Progress, Tooltip } from 'antd'
import { PlusOutlined, DollarOutlined, WalletOutlined, BankOutlined, SwapOutlined, FileTextOutlined, AuditOutlined, CheckCircleOutlined, CloseCircleOutlined, RollbackOutlined, RiseOutlined, FallOutlined, PercentageOutlined, BarcodeOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'

const { Text, Title } = Typography

// ─────────────────────────────────────────────────────────────────
// ACCOUNTING DASHBOARD
// ─────────────────────────────────────────────────────────────────
function AccountingDashboard({ stores }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = () => {
    setError(null);
    api.get('/accounting/summary').then(r => setData(r.data)).catch(e => {
      const msg = e.response?.data?.message || e.message || 'Failed to load accounting';
      setError(msg);
    })
  }
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv) }, [])

  if (error) return <Alert message={error} type="error" showIcon action={<Button size="small" onClick={load}>Retry</Button>} />;
  if (!data) return <Card loading />
  return <>
    <Row gutter={[16, 16]}>
      <Col span={4}><Card size="small"><Statistic title="Cash in Hand" value={Math.round(data.cash_balance)} prefix="₹" valueStyle={{ color: '#52c41a' }} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Bank Balance" value={Math.round(data.bank_balance)} prefix="₹" valueStyle={{ color: '#1890ff' }} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Total (Cash + Bank)" value={Math.round(data.total_cash_and_bank)} prefix="₹" /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Customer Outstanding" value={Math.round(data.customer_outstanding)} prefix="₹" valueStyle={{ color: data.customer_outstanding > 0 ? '#faad14' : '#52c41a' }} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Supplier Dues" value={Math.round(data.supplier_outstanding)} prefix="₹" valueStyle={{ color: data.supplier_outstanding > 0 ? '#ff4d4f' : '#52c41a' }} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Today Income" value={Math.round(data.today_income)} prefix="₹" valueStyle={{ color: '#52c41a' }} /></Card></Col>
    </Row>
  </>
}

// ─────────────────────────────────────────────────────────────────
// CASH BOOK
// ─────────────────────────────────────────────────────────────────
function CashBook({ stores }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ from: dayjs().startOf('month'), to: dayjs() })
  const [txnModal, setTxnModal] = useState(false)
  const [form] = Form.useForm()

  const load = () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filters.from) p.set('from', filters.from.format('YYYY-MM-DD'))
    if (filters.to) p.set('to', filters.to.format('YYYY-MM-DD'))
    api.get(`/accounting/cash-book?${p}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [filters])

  const recordTxn = async (values) => {
    try {
      await api.post('/accounting/transactions', { ...values, payment_mode: 'cash', txn_type: values.direction === 'in' ? 'receipt' : 'expense' })
      message.success('Transaction recorded')
      setTxnModal(false)
      form.resetFields()
      load()
    } catch (e) { message.error('Failed') }
  }

  return <>
    <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      <DatePicker value={filters.from} onChange={v => setFilters(f => ({ ...f, from: v }))} />
      <DatePicker value={filters.to} onChange={v => setFilters(f => ({ ...f, to: v }))} />
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setTxnModal(true)}>Record Cash Transaction</Button>
      <Button onClick={load}>Refresh</Button>
    </Space>
    {data && <Row gutter={16} style={{ marginBottom: 12 }}>
      <Col span={4}><Card size="small"><Statistic title="Opening" value={Math.round(data.summary.opening_balance)} prefix="₹" /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Received" value={Math.round(data.summary.total_in)} prefix="₹" valueStyle={{ color: '#52c41a' }} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Paid Out" value={Math.round(data.summary.total_out)} prefix="₹" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Closing" value={Math.round(data.summary.closing_balance)} prefix="₹" /></Card></Col>
    </Row>}
    <Table dataSource={data?.items || []} rowKey="id" loading={loading} size="small" scroll={{ x: 1000 }}
      columns={[
        { title: 'Date', dataIndex: 'txn_date', render: v => dayjs(v).format('DD/MM/YYYY') },
        { title: 'Type', dataIndex: 'direction', render: v => <Tag color={v === 'in' ? 'green' : 'red'}>{v === 'in' ? 'IN' : 'OUT'}</Tag> },
        { title: 'Description', dataIndex: 'description' },
        { title: 'Opposite', dataIndex: 'opposite_name' },
        { title: 'Amount', dataIndex: 'amount', render: (v, r) => <Text strong style={{ color: r.direction === 'in' ? '#52c41a' : '#ff4d4f' }}>₹{v}</Text> },
        { title: 'Payment Mode', dataIndex: 'payment_mode', render: v => v ? <Tag>{v}</Tag> : '-' },
        { title: 'Ref', dataIndex: 'txn_number' },
        { title: 'By', dataIndex: 'created_by_name' }
      ]} />
    <Modal title="Record Cash Transaction" open={txnModal} onCancel={() => setTxnModal(false)} onOk={() => form.submit()} width={500}>
      <Form form={form} layout="vertical" onFinish={recordTxn}>
        <Form.Item name="txn_date" label="Date" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="direction" label="Type" rules={[{ required: true }]}>
          <Select>
            <Select.Option value="in">Cash Received (In)</Select.Option>
            <Select.Option value="out">Cash Paid (Out)</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="account_id" label="Cash Account" rules={[{ required: true }]}>
          <Select>
            {data?.accounts?.map(a => <Select.Option key={a.id} value={a.id}>{a.name} (₹{a.current_balance})</Select.Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  </>
}

// ─────────────────────────────────────────────────────────────────
// BANK BOOK
// ─────────────────────────────────────────────────────────────────
function BankBook({ stores }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ from: dayjs().startOf('month'), to: dayjs() })
  const [txnModal, setTxnModal] = useState(false)
  const [form] = Form.useForm()

  const load = () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filters.from) p.set('from', filters.from.format('YYYY-MM-DD'))
    if (filters.to) p.set('to', filters.to.format('YYYY-MM-DD'))
    api.get(`/accounting/bank-book?${p}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [filters])

  const recordTxn = async (values) => {
    try {
      await api.post('/accounting/transactions', { ...values, txn_type: values.direction === 'in' ? 'receipt' : 'payment' })
      message.success('Transaction recorded')
      setTxnModal(false)
      form.resetFields()
      load()
    } catch (e) { message.error('Failed') }
  }

  return <>
    <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      <DatePicker value={filters.from} onChange={v => setFilters(f => ({ ...f, from: v }))} />
      <DatePicker value={filters.to} onChange={v => setFilters(f => ({ ...f, to: v }))} />
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setTxnModal(true)}>Record Bank Transaction</Button>
      <Button onClick={load}>Refresh</Button>
    </Space>
    {data && <Row gutter={16} style={{ marginBottom: 12 }}>
      <Col span={4}><Card size="small"><Statistic title="Deposits" value={Math.round(data.summary.total_in)} prefix="₹" valueStyle={{ color: '#52c41a' }} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Withdrawals" value={Math.round(data.summary.total_out)} prefix="₹" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Balance" value={Math.round(data.summary.closing_balance)} prefix="₹" /></Card></Col>
    </Row>}
    <Table dataSource={data?.items || []} rowKey="id" loading={loading} size="small" scroll={{ x: 1100 }}
      columns={[
        { title: 'Date', dataIndex: 'txn_date', render: v => dayjs(v).format('DD/MM/YYYY') },
        { title: 'Type', dataIndex: 'direction', render: v => <Tag color={v === 'in' ? 'green' : 'red'}>{v === 'in' ? 'CR' : 'DR'}</Tag> },
        { title: 'Description', dataIndex: 'description' },
        { title: 'Account', dataIndex: 'account_name' },
        { title: 'Amount', dataIndex: 'amount', render: (v, r) => <Text strong style={{ color: r.direction === 'in' ? '#52c41a' : '#ff4d4f' }}>₹{v}</Text> },
        { title: 'Mode', dataIndex: 'payment_mode', render: v => v ? <Tag>{v}</Tag> : '-' },
        { title: 'Ref #', dataIndex: 'txn_number' },
        { title: 'By', dataIndex: 'created_by_name' }
      ]} />
    <Modal title="Record Bank Transaction" open={txnModal} onCancel={() => setTxnModal(false)} onOk={() => form.submit()} width={500}>
      <Form form={form} layout="vertical" onFinish={recordTxn}>
        <Form.Item name="txn_date" label="Date" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="direction" label="Type" rules={[{ required: true }]}>
          <Select>
            <Select.Option value="in">Deposit (In)</Select.Option>
            <Select.Option value="out">Withdrawal (Out)</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="account_id" label="Bank Account" rules={[{ required: true }]}>
          <Select>
            {data?.accounts?.map(a => <Select.Option key={a.id} value={a.id}>{a.name} (₹{a.current_balance})</Select.Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="payment_mode" label="Mode" initialValue="bank_transfer">
          <Select>
            <Select.Option value="bank_transfer">Bank Transfer</Select.Option>
            <Select.Option value="neft">NEFT</Select.Option>
            <Select.Option value="imps">IMPS</Select.Option>
            <Select.Option value="rtgs">RTGS</Select.Option>
            <Select.Option value="cheque">Cheque</Select.Option>
            <Select.Option value="upi">UPI</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  </>
}

// ─────────────────────────────────────────────────────────────────
// INCOME
// ─────────────────────────────────────────────────────────────────
function IncomeTracker({ stores }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ from: dayjs().startOf('month'), to: dayjs() })
  const [incModal, setIncModal] = useState(false)
  const [form] = Form.useForm()

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filters.from) p.set('from', filters.from.format('YYYY-MM-DD'))
    if (filters.to) p.set('to', filters.to.format('YYYY-MM-DD'))
    api.get(`/accounting/income?${p}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }, [filters])
  useEffect(() => { load() }, [load])

  const recordIncome = async (values) => {
    try {
      await api.post('/accounting/income', values)
      message.success('Income recorded')
      setIncModal(false)
      form.resetFields()
      load()
    } catch (e) { message.error('Failed') }
  }

  return <>
    <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      <DatePicker value={filters.from} onChange={v => setFilters(f => ({ ...f, from: v }))} />
      <DatePicker value={filters.to} onChange={v => setFilters(f => ({ ...f, to: v }))} />
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setIncModal(true)}>Record Income</Button>
      <Button onClick={load}>Refresh</Button>
    </Space>
    {data && <Row gutter={16} style={{ marginBottom: 12 }}>
      <Col span={6}><Card size="small"><Statistic title="Total Income" value={Math.round(data.total)} prefix="₹" valueStyle={{ color: '#52c41a' }} /></Card></Col>
      {Object.entries(data.by_head || {}).map(([head, v]) => (
        <Col span={4} key={head}><Card size="small"><Statistic title={head} value={Math.round(v.total)} prefix="₹" /></Card></Col>
      ))}
    </Row>}
    <Table dataSource={data?.items || []} rowKey="id" loading={loading} size="small" scroll={{ x: 1000 }}
      columns={[
        { title: 'Date', dataIndex: 'txn_date', render: v => dayjs(v).format('DD/MM/YYYY') },
        { title: 'Description', dataIndex: 'description' },
        { title: 'Income Head', dataIndex: 'income_head' },
        { title: 'Account', dataIndex: 'account_name' },
        { title: 'Amount', dataIndex: 'amount', render: v => <Text strong style={{ color: '#52c41a' }}>₹{v}</Text> },
        { title: 'Mode', dataIndex: 'payment_mode', render: v => <Tag>{v}</Tag> },
        { title: 'Ref #', dataIndex: 'txn_number' }
      ]} />
    <Modal title="Record Income" open={incModal} onCancel={() => setIncModal(false)} onOk={() => form.submit()} width={500}>
      <Form form={form} layout="vertical" onFinish={recordIncome}>
        <Form.Item name="txn_date" label="Date" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="income_head_id" label="Income Head" rules={[{ required: true }]}>
          <Select>
            {data?.heads?.map(h => <Select.Option key={h.id} value={h.id}>{h.name}</Select.Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="account_id" label="Received In" rules={[{ required: true }]}>
          <Select>
            <Select.Option value="acc-default-cash">Cash in Hand</Select.Option>
            <Select.Option value="acc-default-bank">Bank Account</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="payment_mode" label="Payment Mode" initialValue="cash">
          <Select>
            <Select.Option value="cash">Cash</Select.Option>
            <Select.Option value="upi">UPI</Select.Option>
            <Select.Option value="card">Card</Select.Option>
            <Select.Option value="bank_transfer">Bank Transfer</Select.Option>
            <Select.Option value="cheque">Cheque</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  </>
}

// ─────────────────────────────────────────────────────────────────
// CUSTOMER LEDGER
// ─────────────────────────────────────────────────────────────────
function CustomerLedgerView({ customers }) {
  const [selected, setSelected] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [txnModal, setTxnModal] = useState(false)
  const [form] = Form.useForm()
  const [filters, setFilters] = useState({ from: dayjs().subtract(3, 'month'), to: dayjs() })

  const load = (customerId) => {
    if (!customerId) return
    setLoading(true)
    const p = new URLSearchParams()
    if (filters.from) p.set('from', filters.from.format('YYYY-MM-DD'))
    if (filters.to) p.set('to', filters.to.format('YYYY-MM-DD'))
    api.get(`/accounting/customer-ledger/${customerId}?${p}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { if (selected) load(selected) }, [selected, filters])

  const recordTxn = async (values) => {
    try {
      await api.post('/accounting/customer-transaction', { ...values, customer_id: selected })
      message.success('Entry recorded')
      setTxnModal(false)
      form.resetFields()
      load(selected)
    } catch (e) { message.error('Failed') }
  }

  return <>
    <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      <Select placeholder="Select Customer" showSearch style={{ width: 300 }} value={selected} onChange={setSelected} filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}>
        {customers.filter(c => c.customer_type === 'hotel' || c.customer_type === 'corporate').map(c => <Select.Option key={c.id} value={c.id}>{c.name} (₹{c.current_outstanding})</Select.Option>)}
      </Select>
      <DatePicker value={filters.from} onChange={v => setFilters(f => ({ ...f, from: v }))} />
      <DatePicker value={filters.to} onChange={v => setFilters(f => ({ ...f, to: v }))} />
      {selected && <Button type="primary" icon={<PlusOutlined />} onClick={() => setTxnModal(true)}>Add Entry</Button>}
    </Space>
    {data && <Row gutter={16} style={{ marginBottom: 12 }}>
      <Col span={6}><Card size="small"><Statistic title="Customer" value={data.customer?.name} /></Card></Col>
      <Col span={6}><Card size="small"><Statistic title="Current Balance" value={Math.round(data.current_balance)} prefix="₹" valueStyle={{ color: data.current_balance > 0 ? '#faad14' : '#52c41a' }} /></Card></Col>
      <Col span={6}><Card size="small"><Statistic title="Credit Limit" value={data.customer?.credit_limit || 0} prefix="₹" /></Card></Col>
      <Col span={6}><Card size="small"><Statistic title="Credit Days" value={data.customer?.credit_days || 0} suffix="days" /></Card></Col>
    </Row>}
    <Table dataSource={data?.items || []} rowKey="id" loading={loading} size="small" scroll={{ x: 1000 }}
      columns={[
        { title: 'Date', dataIndex: 'txn_date', render: v => dayjs(v).format('DD/MM/YYYY') },
        { title: 'Type', dataIndex: 'txn_type', render: v => <Tag>{v}</Tag> },
        { title: 'Description', dataIndex: 'description' },
        { title: 'Debit', dataIndex: 'debit', render: v => v > 0 ? <Text style={{ color: '#ff4d4f' }}>₹{v}</Text> : '-' },
        { title: 'Credit', dataIndex: 'credit', render: v => v > 0 ? <Text style={{ color: '#52c41a' }}>₹{v}</Text> : '-' },
        { title: 'Balance', dataIndex: 'balance', render: v => <Text strong>₹{Math.round(v)}</Text> },
        { title: 'Ref', dataIndex: 'reference_type', render: (v, r) => v ? <Tag>{v}:{r.reference_id?.substring(0,8)}</Tag> : '-' }
      ]} />
    <Modal title="Customer Ledger Entry" open={txnModal} onCancel={() => setTxnModal(false)} onOk={() => form.submit()} width={500}>
      <Form form={form} layout="vertical" onFinish={recordTxn}>
        <Form.Item name="txn_date" label="Date" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="txn_type" label="Entry Type" rules={[{ required: true }]}>
          <Select>
            <Select.Option value="invoice">Invoice (Customer Owes)</Select.Option>
            <Select.Option value="payment">Payment Received</Select.Option>
            <Select.Option value="credit_note">Credit Note (Reduce Dues)</Select.Option>
            <Select.Option value="debit_note">Debit Note (Increase Dues)</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  </>
}

// ─────────────────────────────────────────────────────────────────
// SUPPLIER LEDGER
// ─────────────────────────────────────────────────────────────────
function SupplierLedgerView({ suppliers }) {
  const [selected, setSelected] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [txnModal, setTxnModal] = useState(false)
  const [form] = Form.useForm()
  const [filters, setFilters] = useState({ from: dayjs().subtract(3, 'month'), to: dayjs() })

  const load = (supplierId) => {
    if (!supplierId) return
    setLoading(true)
    const p = new URLSearchParams()
    if (filters.from) p.set('from', filters.from.format('YYYY-MM-DD'))
    if (filters.to) p.set('to', filters.to.format('YYYY-MM-DD'))
    api.get(`/accounting/supplier-ledger/${supplierId}?${p}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { if (selected) load(selected) }, [selected, filters])

  const recordTxn = async (values) => {
    try {
      await api.post('/accounting/supplier-transaction', { ...values, supplier_id: selected })
      message.success('Entry recorded')
      setTxnModal(false)
      form.resetFields()
      load(selected)
    } catch (e) { message.error('Failed') }
  }

  return <>
    <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      <Select placeholder="Select Supplier" showSearch style={{ width: 300 }} value={selected} onChange={setSelected} filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}>
        {suppliers.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
      </Select>
      <DatePicker value={filters.from} onChange={v => setFilters(f => ({ ...f, from: v }))} />
      <DatePicker value={filters.to} onChange={v => setFilters(f => ({ ...f, to: v }))} />
      {selected && <Button type="primary" icon={<PlusOutlined />} onClick={() => setTxnModal(true)}>Add Entry</Button>}
    </Space>
    {data && <Row gutter={16} style={{ marginBottom: 12 }}>
      <Col span={8}><Card size="small"><Statistic title="Supplier" value={data.supplier?.name} /></Card></Col>
      <Col span={8}><Card size="small"><Statistic title="Balance" value={Math.round(data.current_balance)} prefix="₹" valueStyle={{ color: data.current_balance > 0 ? '#ff4d4f' : '#52c41a' }} /></Card></Col>
    </Row>}
    <Table dataSource={data?.items || []} rowKey="id" loading={loading} size="small" scroll={{ x: 1000 }}
      columns={[
        { title: 'Date', dataIndex: 'txn_date', render: v => dayjs(v).format('DD/MM/YYYY') },
        { title: 'Type', dataIndex: 'txn_type', render: v => <Tag>{v}</Tag> },
        { title: 'Description', dataIndex: 'description' },
        { title: 'Debit (We Paid)', dataIndex: 'debit', render: v => v > 0 ? <Text style={{ color: '#52c41a' }}>₹{v}</Text> : '-' },
        { title: 'Credit (We Owe)', dataIndex: 'credit', render: v => v > 0 ? <Text style={{ color: '#ff4d4f' }}>₹{v}</Text> : '-' },
        { title: 'Balance', dataIndex: 'balance', render: v => <Text strong>₹{Math.round(v)}</Text> }
      ]} />
    <Modal title="Supplier Ledger Entry" open={txnModal} onCancel={() => setTxnModal(false)} onOk={() => form.submit()} width={500}>
      <Form form={form} layout="vertical" onFinish={recordTxn}>
        <Form.Item name="txn_date" label="Date" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="txn_type" label="Entry Type" rules={[{ required: true }]}>
          <Select>
            <Select.Option value="purchase">Purchase (We Owe)</Select.Option>
            <Select.Option value="payment">Payment Made</Select.Option>
            <Select.Option value="credit_note">Credit Note (Reduce Dues)</Select.Option>
            <Select.Option value="debit_note">Debit Note (Increase Dues)</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  </>
}

// ─────────────────────────────────────────────────────────────────
// OUTSTANDING
// ─────────────────────────────────────────────────────────────────
function OutstandingView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get('/accounting/outstanding').then(r => setData(r.data)).finally(() => setLoading(false))
  }, [])

  if (!data) return <Card loading />
  return <>
    <Row gutter={16} style={{ marginBottom: 12 }}>
      <Col span={6}><Card size="small"><Statistic title="Customer Outstanding" value={Math.round(data.totals.customer_outstanding)} prefix="₹" valueStyle={{ color: '#faad14' }} /></Card></Col>
      <Col span={6}><Card size="small"><Statistic title="Supplier Outstanding" value={Math.round(data.totals.supplier_outstanding)} prefix="₹" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      <Col span={6}><Card size="small"><Statistic title="Net Receivable" value={Math.round(data.totals.customer_outstanding - data.totals.supplier_outstanding)} prefix="₹" /></Card></Col>
    </Row>
    <Row gutter={16}>
      <Col span={12}>
        <Card title="Customer Outstanding" size="small">
          <Table dataSource={data.customers} rowKey="id" size="small" pagination={false}
            columns={[
              { title: 'Customer', dataIndex: 'name' },
              { title: 'Outstanding', dataIndex: 'current_outstanding', render: v => <Text strong style={{ color: '#faad14' }}>₹{Math.round(v)}</Text> },
              { title: 'Limit', dataIndex: 'credit_limit', render: v => `₹${v}` },
              { title: 'Credit Days', dataIndex: 'credit_days' }
            ]} />
        </Card>
      </Col>
      <Col span={12}>
        <Card title="Supplier Outstanding" size="small">
          <Table dataSource={data.suppliers} rowKey="id" size="small" pagination={false}
            columns={[
              { title: 'Supplier', dataIndex: 'name' },
              { title: 'Outstanding', dataIndex: 'outstanding', render: v => <Text strong style={{ color: '#ff4d4f' }}>₹{Math.round(v)}</Text> }
            ]} />
        </Card>
      </Col>
    </Row>
  </>
}

// ─────────────────────────────────────────────────────────────────
// CHEQUE LIFECYCLE
// ─────────────────────────────────────────────────────────────────
function ChequeLifecycle() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [chqModal, setChqModal] = useState(false)
  const [statusModal, setStatusModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({})
  const [form] = Form.useForm()
  const [statusForm] = Form.useForm()

  const load = () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filters.status) p.set('status', filters.status)
    if (filters.type) p.set('type', filters.type)
    api.get(`/accounting/cheques?${p}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [filters])

  const registerCheque = async (values) => {
    try {
      await api.post('/accounting/cheques', values)
      message.success('Cheque registered')
      setChqModal(false)
      form.resetFields()
      load()
    } catch (e) { message.error('Failed') }
  }

  const updateStatus = async (values) => {
    try {
      await api.put(`/accounting/cheques/${selected.id}/status`, values)
      message.success('Status updated')
      setStatusModal(false)
      statusForm.resetFields()
      load()
    } catch (e) { message.error('Failed') }
  }

  const statusColor = { pending: 'default', deposited: 'blue', cleared: 'green', bounced: 'red', cancelled: 'orange', returned: 'purple' }

  return <>
    <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      <Select placeholder="Status" allowClear style={{ width: 130 }} value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))}>
        <Select.Option value="pending">Pending</Select.Option>
        <Select.Option value="deposited">Deposited</Select.Option>
        <Select.Option value="cleared">Cleared</Select.Option>
        <Select.Option value="bounced">Bounced</Select.Option>
        <Select.Option value="cancelled">Cancelled</Select.Option>
      </Select>
      <Select placeholder="Type" allowClear style={{ width: 130 }} value={filters.type} onChange={v => setFilters(f => ({ ...f, type: v }))}>
        <Select.Option value="received">Received</Select.Option>
        <Select.Option value="issued">Issued</Select.Option>
      </Select>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setChqModal(true)}>Register Cheque</Button>
      <Button onClick={load}>Refresh</Button>
    </Space>
    <Table dataSource={data} rowKey="id" loading={loading} size="small" scroll={{ x: 1200 }}
      columns={[
        { title: 'Cheque #', dataIndex: 'cheque_number' },
        { title: 'Type', dataIndex: 'cheque_type', render: v => <Tag color={v === 'received' ? 'green' : 'red'}>{v}</Tag> },
        { title: 'Party', dataIndex: 'party_name' },
        { title: 'Bank', dataIndex: 'bank_name' },
        { title: 'Date', dataIndex: 'cheque_date', render: v => dayjs(v).format('DD/MM/YYYY') },
        { title: 'Amount', dataIndex: 'amount', render: v => <Text strong>₹{v}</Text> },
        { title: 'Drawer', dataIndex: 'drawer_name', render: v => v || '-' },
        { title: 'Payee', dataIndex: 'payee_name', render: v => v || '-' },
        { title: 'Status', dataIndex: 'status', render: v => <Tag color={statusColor[v]}>{v}</Tag> },
        { title: 'Deposit', dataIndex: 'deposit_date', render: v => v ? dayjs(v).format('DD/MM') : '-' },
        { title: 'Clearance', dataIndex: 'clearance_date', render: v => v ? dayjs(v).format('DD/MM') : '-' },
        { title: 'Action', render: (_, r) => r.status === 'pending' || r.status === 'deposited'
          ? <Button size="small" onClick={() => { setSelected(r); setStatusModal(true); statusForm.setFieldsValue({ status: r.status === 'pending' ? 'deposited' : 'cleared' }) }}>Update</Button>
          : null }
      ]} />
    <Modal title="Register Cheque" open={chqModal} onCancel={() => setChqModal(false)} onOk={() => form.submit()} width={550}>
      <Form form={form} layout="vertical" onFinish={registerCheque}>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="cheque_number" label="Cheque Number" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="cheque_type" label="Type" rules={[{ required: true }]}><Select>
            <Select.Option value="received">Received (from Customer)</Select.Option>
            <Select.Option value="issued">Issued (to Supplier)</Select.Option>
          </Select></Form.Item></Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="party_name" label="Party Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="party_type" label="Party Type"><Select allowClear>
            <Select.Option value="customer">Customer</Select.Option>
            <Select.Option value="supplier">Supplier</Select.Option>
            <Select.Option value="other">Other</Select.Option>
          </Select></Form.Item></Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={12}><Form.Item name="cheque_date" label="Cheque Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
        </Row>
        <Form.Item name="bank_name" label="Bank Name"><Input /></Form.Item>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="drawer_name" label="Drawer Name"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="payee_name" label="Payee Name"><Input /></Form.Item></Col>
        </Row>
      </Form>
    </Modal>
    <Modal title="Update Cheque Status" open={statusModal} onCancel={() => setStatusModal(false)} onOk={() => statusForm.submit()} width={450}>
      <Form form={statusForm} layout="vertical" onFinish={updateStatus}>
        <Form.Item label="Current Status"><Tag>{selected?.status}</Tag></Form.Item>
        <Form.Item name="status" label="New Status" rules={[{ required: true }]}>
          <Select>
            {selected?.status === 'pending' && <Select.Option value="deposited">Deposit</Select.Option>}
            {selected?.status === 'pending' && <Select.Option value="cancelled">Cancel</Select.Option>}
            {selected?.status === 'deposited' && <Select.Option value="cleared">Cleared</Select.Option>}
            {selected?.status === 'deposited' && <Select.Option value="bounced">Bounced</Select.Option>}
          </Select>
        </Form.Item>
        {statusForm.getFieldValue('status') === 'deposited' && <Form.Item name="deposit_date" label="Deposit Date"><DatePicker style={{ width: '100%' }} /></Form.Item>}
        {statusForm.getFieldValue('status') === 'cleared' && <Form.Item name="clearance_date" label="Clearance Date"><DatePicker style={{ width: '100%' }} /></Form.Item>}
        {statusForm.getFieldValue('status') === 'bounced' && <><Form.Item name="bounce_reason" label="Bounce Reason"><Input.TextArea rows={2} /></Form.Item><Form.Item name="bounce_date" label="Bounce Date"><DatePicker style={{ width: '100%' }} /></Form.Item></>}
      </Form>
    </Modal>
  </>
}

// ─────────────────────────────────────────────────────────────────
// SPLIT PAYMENTS
// ─────────────────────────────────────────────────────────────────
function SplitPayments() {
  const [modal, setModal] = useState(false)
  const [form] = Form.useForm()
  const [splits, setSplits] = useState([{ payment_mode: 'cash', amount: '', reference_no: '' }])

  const addSplit = () => setSplits([...splits, { payment_mode: 'cash', amount: '', reference_no: '' }])
  const removeSplit = (i) => setSplits(splits.filter((_, idx) => idx !== i))
  const updateSplit = (i, k, v) => {
    const copy = [...splits]
    copy[i] = { ...copy[i], [k]: v }
    setSplits(copy)
  }

  const handleSubmit = async (values) => {
    try {
      const totalSplit = splits.reduce((s, sp) => s + parseFloat(sp.amount || 0), 0)
      if (Math.abs(totalSplit - values.amount) > 0.01) return message.error('Split amounts must equal total')
      await api.post('/accounting/split-payment', { ...values, splits: splits.filter(s => s.amount) })
      message.success('Split payment recorded')
      setModal(false)
      form.resetFields()
      setSplits([{ payment_mode: 'cash', amount: '', reference_no: '' }])
    } catch (e) { message.error('Failed') }
  }

  return <>
    <Button type="primary" icon={<SwapOutlined />} onClick={() => setModal(true)}>Record Split Payment</Button>
    <Modal title="Split Payment" open={modal} onCancel={() => setModal(false)} onOk={() => form.submit()} width={600}>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="txn_date" label="Date" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="account_id" label="Account" rules={[{ required: true }]}>
            <Select><Select.Option value="acc-default-cash">Cash in Hand</Select.Option><Select.Option value="acc-default-bank">Bank Account</Select.Option></Select>
          </Form.Item></Col>
          <Col span={12}><Form.Item name="amount" label="Total Amount (₹)" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} onChange={v => { if (splits.length === 1) updateSplit(0, 'amount', v) }} />
          </Form.Item></Col>
        </Row>
        <Divider>Split Details</Divider>
        {splits.map((s, i) => <Row gutter={8} key={i} style={{ marginBottom: 8 }}>
          <Col span={6}>
            <Select value={s.payment_mode} onChange={v => updateSplit(i, 'payment_mode', v)} style={{ width: '100%' }}>
              <Select.Option value="cash">Cash</Select.Option>
              <Select.Option value="upi">UPI</Select.Option>
              <Select.Option value="card">Card</Select.Option>
              <Select.Option value="cheque">Cheque</Select.Option>
              <Select.Option value="bank_transfer">Bank Transfer</Select.Option>
            </Select>
          </Col>
          <Col span={6}>
            <InputNumber placeholder="Amount" value={s.amount} onChange={v => updateSplit(i, 'amount', v)} min={1} style={{ width: '100%' }} />
          </Col>
          <Col span={8}>
            <Input placeholder="Reference No" value={s.reference_no} onChange={e => updateSplit(i, 'reference_no', e.target.value)} />
          </Col>
          <Col span={2}>
            {splits.length > 1 && <Button danger size="small" onClick={() => removeSplit(i)} icon={<CloseCircleOutlined />} />}
          </Col>
        </Row>)}
        <Button type="dashed" onClick={addSplit} block icon={<PlusOutlined />}>Add Split</Button>
      </Form>
    </Modal>
  </>
}

// ─────────────────────────────────────────────────────────────────
// CREDIT & DEBIT NOTES
// ─────────────────────────────────────────────────────────────────
function NotesManager() {
  const [invoices, setInvoices] = useState([])
  const [cnModal, setCnModal] = useState(false)
  const [dnModal, setDnModal] = useState(false)
  const [cnForm] = Form.useForm()
  const [dnForm] = Form.useForm()

  useEffect(() => {
    api.get('/finance/invoices?status=unpaid').then(r => setInvoices(r.data.slice(0, 50))).catch(() => {})
  }, [])

  const issueCN = async (values) => {
    try {
      await api.post('/finance/credit-notes', values)
      message.success('Credit note issued')
      setCnModal(false)
      cnForm.resetFields()
    } catch (e) { message.error('Failed') }
  }

  const issueDN = async (values) => {
    try {
      await api.post('/finance/debit-notes', values)
      message.success('Debit note issued')
      setDnModal(false)
      dnForm.resetFields()
    } catch (e) { message.error('Failed') }
  }

  return <>
    <Space style={{ marginBottom: 12 }}>
      <Button type="primary" icon={<RollbackOutlined />} onClick={() => setCnModal(true)}>Issue Credit Note</Button>
      <Button icon={<AuditOutlined />} onClick={() => setDnModal(true)}>Issue Debit Note</Button>
      <Button onClick={() => api.get('/finance/invoices').then(r => setInvoices(r.data))}>Refresh</Button>
    </Space>
    <Table dataSource={invoices} rowKey="id" size="small" columns={[
      { title: 'Invoice', dataIndex: 'invoice_number' },
      { title: 'Customer', dataIndex: 'customer_name' },
      { title: 'Amount', dataIndex: 'net_amount', render: v => `₹${v}` },
      { title: 'Balance', dataIndex: 'balance_due', render: v => v > 0 ? <Tag color="red">₹{v}</Tag> : <Tag color="green">Paid</Tag> },
      { title: 'Status', dataIndex: 'status', render: v => <Tag>{v}</Tag> }
    ]} />
    <Modal title="Issue Credit Note (Increase Customer Balance)" open={cnModal} onCancel={() => setCnModal(false)} onOk={() => cnForm.submit()} width={450}>
      <Form form={cnForm} layout="vertical" onFinish={issueCN}>
        <Form.Item name="invoice_id" label="Invoice" rules={[{ required: true }]}>
          <Select showSearch filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}>
            {invoices.map(i => <Select.Option key={i.id} value={i.id}>{i.invoice_number} - {i.customer_name} (₹{i.balance_due})</Select.Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="customer_id" label="Customer" rules={[{ required: true }]}>
          <Select showSearch filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}>
            {[...new Set(invoices.map(i => i.customer_id))].map(id => {
              const inv = invoices.find(i => i.customer_id === id)
              return <Select.Option key={id} value={id}>{inv?.customer_name}</Select.Option>
            })}
          </Select>
        </Form.Item>
        <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="reason" label="Reason" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
    <Modal title="Issue Debit Note (Decrease Customer Balance)" open={dnModal} onCancel={() => setDnModal(false)} onOk={() => dnForm.submit()} width={450}>
      <Form form={dnForm} layout="vertical" onFinish={issueDN}>
        <Form.Item name="invoice_id" label="Invoice" rules={[{ required: true }]}>
          <Select showSearch filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}>
            {invoices.map(i => <Select.Option key={i.id} value={i.id}>{i.invoice_number} - {i.customer_name} (₹{i.balance_due})</Select.Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="customer_id" label="Customer" rules={[{ required: true }]}>
          <Select showSearch filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}>
            {[...new Set(invoices.map(i => i.customer_id))].map(id => {
              const inv = invoices.find(i => i.customer_id === id)
              return <Select.Option key={id} value={id}>{inv?.customer_name}</Select.Option>
            })}
          </Select>
        </Form.Item>
        <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="reason" label="Reason" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  </>
}

// ─────────────────────────────────────────────────────────────────
// P&L STATEMENT
// ─────────────────────────────────────────────────────────────────
function PLStatement({ stores }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ from: dayjs().startOf('month'), to: dayjs() })

  useEffect(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filters.from) p.set('from', filters.from.format('YYYY-MM-DD'))
    if (filters.to) p.set('to', filters.to.format('YYYY-MM-DD'))
    api.get(`/accounting/pl?${p}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }, [filters])

  if (!data) return <Card loading />
  const isProfitable = data.net_profit > 0

  return <>
    <Space style={{ marginBottom: 12 }}>
      <DatePicker value={filters.from} onChange={v => setFilters(f => ({ ...f, from: v }))} />
      <DatePicker value={filters.to} onChange={v => setFilters(f => ({ ...f, to: v }))} />
      <Button onClick={() => setFilters({ ...filters })}>Refresh</Button>
    </Space>
    <Row gutter={16} style={{ marginBottom: 12 }}>
      <Col span={12}>
        <Card title="Profit & Loss Statement" size="small">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Period">{data.period.from} to {data.period.to}</Descriptions.Item>
          </Descriptions>
          <Divider />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: 8, fontWeight: 'bold' }}>Revenue (Sales)</td><td style={{ textAlign: 'right', padding: 8 }}>₹{Math.round(data.revenue.from_sales)}</td></tr>
              <tr><td style={{ padding: 8 }}>Less: Cost of Goods Sold</td><td style={{ textAlign: 'right', padding: 8, color: '#ff4d4f' }}>(₹{Math.round(data.cogs)})</td></tr>
              <tr style={{ backgroundColor: '#f6f8fa' }}><td style={{ padding: 8, fontWeight: 'bold' }}>Gross Profit</td><td style={{ textAlign: 'right', padding: 8, fontWeight: 'bold' }}>₹{Math.round(data.gross_profit)} ({data.gross_margin_pct?.toFixed(1)}%)</td></tr>
              <tr><td colSpan={2} style={{ padding: 4 }}><Divider style={{ margin: 0 }} /></td></tr>
              <tr><td style={{ padding: 8, fontWeight: 'bold' }}>Expenses</td><td style={{ textAlign: 'right', padding: 8 }}></td></tr>
              {Object.entries(data.income_by_head || {}).map(([head, v]) => (
                <tr key={head}><td style={{ padding: '2px 8px', paddingLeft: 24 }}>{head}</td><td style={{ textAlign: 'right', padding: '2px 8px' }}>₹{Math.round(v.total)}</td></tr>
              ))}
              {Object.entries(data.expense_by_type || {}).map(([type, v]) => (
                <tr key={type}><td style={{ padding: '2px 8px', paddingLeft: 24 }}>{v.account || type}</td><td style={{ textAlign: 'right', padding: '2px 8px', color: '#ff4d4f' }}>(₹{Math.round(v.total)})</td></tr>
              ))}
              <tr style={{ backgroundColor: '#fff7e6' }}><td style={{ padding: 8, fontWeight: 'bold' }}>Total Expenses</td><td style={{ textAlign: 'right', padding: 8, fontWeight: 'bold', color: '#ff4d4f' }}>₹{Math.round(data.total_expenses)}</td></tr>
              <tr><td colSpan={2} style={{ padding: 4 }}><Divider style={{ margin: 0 }} /></td></tr>
              <tr style={{ backgroundColor: isProfitable ? '#f6ffed' : '#fff2f0' }}>
                <td style={{ padding: 12, fontWeight: 'bold', fontSize: 16 }}>
                  {isProfitable ? <RiseOutlined style={{ color: '#52c41a' }} /> : <FallOutlined style={{ color: '#ff4d4f' }} />} Net Profit / (Loss)
                </td>
                <td style={{ textAlign: 'right', padding: 12, fontWeight: 'bold', fontSize: 16, color: isProfitable ? '#52c41a' : '#ff4d4f' }}>
                  ₹{Math.abs(Math.round(data.net_profit))} ({data.net_margin_pct?.toFixed(1)}%)
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      </Col>
      <Col span={12}>
        <Card title="Income by Head" size="small">
          <Table dataSource={data.income_by_head} rowKey="head" size="small" pagination={false}
            columns={[
              { title: 'Income Head', dataIndex: 'head' },
              { title: 'Amount', dataIndex: 'total', render: v => <Text style={{ color: '#52c41a' }}>₹{Math.round(v)}</Text> }
            ]} />
        </Card>
        <Card title="Expenses by Type" size="small" style={{ marginTop: 12 }}>
          <Table dataSource={data.expense_by_type} rowKey="account" size="small" pagination={false}
            columns={[
              { title: 'Account', dataIndex: 'account' },
              { title: 'Type', dataIndex: 'txn_type' },
              { title: 'Amount', dataIndex: 'total', render: v => <Text style={{ color: '#ff4d4f' }}>₹{Math.round(v)}</Text> }
            ]} />
        </Card>
      </Col>
    </Row>
  </>
}

// ─────────────────────────────────────────────────────────────────
// CASH FLOW
// ─────────────────────────────────────────────────────────────────
function CashFlowView({ stores }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ from: dayjs().startOf('month'), to: dayjs() })

  useEffect(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filters.from) p.set('from', filters.from.format('YYYY-MM-DD'))
    if (filters.to) p.set('to', filters.to.format('YYYY-MM-DD'))
    api.get(`/accounting/cash-flow?${p}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }, [filters])

  if (!data) return <Card loading />

  return <>
    <Space style={{ marginBottom: 12 }}>
      <DatePicker value={filters.from} onChange={v => setFilters(f => ({ ...f, from: v }))} />
      <DatePicker value={filters.to} onChange={v => setFilters(f => ({ ...f, to: v }))} />
      <Button onClick={() => setFilters({ ...filters })}>Refresh</Button>
    </Space>
    <Row gutter={16} style={{ marginBottom: 12 }}>
      <Col span={6}><Card size="small"><Statistic title="Total Inflow" value={Math.round(data.total_inflow)} prefix="₹" valueStyle={{ color: '#52c41a' }} /></Card></Col>
      <Col span={6}><Card size="small"><Statistic title="Total Outflow" value={Math.round(data.total_outflow)} prefix="₹" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      <Col span={6}><Card size="small"><Statistic title="Net Cash Flow" value={Math.round(data.net_flow)} prefix="₹" valueStyle={{ color: data.net_flow >= 0 ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
    </Row>
    <Row gutter={16}>
      <Col span={12}>
        <Card title="Inflows" size="small">
          <Table dataSource={data.inflows} rowKey="id" size="small" pagination={{ pageSize: 10 }}
            columns={[
              { title: 'Date', dataIndex: 'txn_date', render: v => dayjs(v).format('DD/MM') },
              { title: 'Description', dataIndex: 'description' },
              { title: 'Account', dataIndex: 'account_name' },
              { title: 'Amount', dataIndex: 'amount', render: v => <Text strong style={{ color: '#52c41a' }}>+₹{v}</Text> }
            ]} />
        </Card>
      </Col>
      <Col span={12}>
        <Card title="Outflows" size="small">
          <Table dataSource={data.outflows} rowKey="id" size="small" pagination={{ pageSize: 10 }}
            columns={[
              { title: 'Date', dataIndex: 'txn_date', render: v => dayjs(v).format('DD/MM') },
              { title: 'Description', dataIndex: 'description' },
              { title: 'Category', dataIndex: 'category' },
              { title: 'Amount', dataIndex: 'amount', render: v => <Text strong style={{ color: '#ff4d4f' }}>-₹{v}</Text> }
            ]} />
        </Card>
      </Col>
    </Row>
    <Card title="Outflow by Category" size="small" style={{ marginTop: 12 }}>
      <Table dataSource={Object.entries(data.outflow_by_category || {}).map(([k, v]) => ({ category: k, ...v }))} rowKey="category" size="small" pagination={false}
        columns={[
          { title: 'Category', dataIndex: 'category' },
          { title: 'Amount', dataIndex: 'total', render: v => <Text style={{ color: '#ff4d4f' }}>₹{Math.round(v)}</Text> },
          { title: 'Transactions', dataIndex: 'count' }
        ]} />
    </Card>
  </>
}

// ─────────────────────────────────────────────────────────────────
// MAIN FINANCE PAGE
// ─────────────────────────────────────────────────────────────────
export default function Finance() {
  const [customers, setCustomers] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [stores, setStores] = useState([])

  useEffect(() => {
    Promise.all([
      api.get('/customers'),
      api.get('/suppliers'),
      api.get('/masterdata/stores')
    ]).then(([c, s, st]) => {
      setCustomers(Array.isArray(c?.data) ? c.data : [])
      setSuppliers(Array.isArray(s?.data) ? s.data : [])
      setStores(Array.isArray(st?.data) ? st.data : [])
    }).catch(() => {})
  }, [])

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', children: <AccountingDashboard stores={stores} /> },
    { key: 'cash-book', label: 'Cash Book', children: <CashBook stores={stores} /> },
    { key: 'bank-book', label: 'Bank Book', children: <BankBook stores={stores} /> },
    { key: 'income', label: 'Income', children: <IncomeTracker stores={stores} /> },
    { key: 'customer-ledger', label: 'Customer Ledger', children: <CustomerLedgerView customers={customers} /> },
    { key: 'supplier-ledger', label: 'Supplier Ledger', children: <SupplierLedgerView suppliers={suppliers} /> },
    { key: 'outstanding', label: 'Outstanding', children: <OutstandingView /> },
    { key: 'notes', label: 'Credit/Debit Notes', children: <NotesManager /> },
    { key: 'cheques', label: 'Cheque Lifecycle', children: <ChequeLifecycle /> },
    { key: 'split', label: 'Split Payments', children: <SplitPayments /> },
    { key: 'pl', label: 'P&L Statement', children: <PLStatement stores={stores} /> },
    { key: 'cash-flow', label: 'Cash Flow', children: <CashFlowView stores={stores} /> },
  ]

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Finance & Accounting</Title>
      <Tabs items={tabs} />
    </div>
  )
}
