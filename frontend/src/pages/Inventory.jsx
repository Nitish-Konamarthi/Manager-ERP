import React, { useState, useEffect, useCallback } from 'react'
import { Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, DatePicker, Space, message, Tag, Card, Row, Col, Statistic, List, Descriptions, Badge, Progress, Timeline, Typography, Divider, Alert, Tooltip, Popconfirm } from 'antd'
import { PlusOutlined, WarningOutlined, CheckCircleOutlined, CloseCircleOutlined, ArrowUpOutlined, ArrowDownOutlined, SwapOutlined, BarcodeOutlined, ClockCircleOutlined, PercentageOutlined, DollarOutlined, ReloadOutlined, ScanOutlined, SendOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'

const { Text, Title } = Typography

// ─────────────────────────────────────────────────────────────────
// INVENTORY DASHBOARD
// ─────────────────────────────────────────────────────────────────
function InventoryDashboard({ stores }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = () => {
    api.get('/inventory/dashboard').then(r => { setData(r.data); setError(null); }).catch(e => {
      const msg = e.response?.data?.message || e.message || 'Failed to load inventory';
      setError(msg);
    })
  }
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv) }, [])

  if (error) return <Alert message={error} type="error" showIcon action={<Button size="small" onClick={load}>Retry</Button>} />;
  if (!data) return <Card loading />

  return <>
    <Row gutter={[16, 16]}>
      <Col span={4}><Card size="small"><Statistic title="Total Batches" value={data.total_batches} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Total Qty (kg)" value={Math.round(data.total_qty)} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Stock Value" value={Math.round(data.total_value)} prefix="₹" /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Reserved" value={Math.round(data.total_reserved_qty)} valueStyle={{ color: '#1890ff' }} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Expiring" value={data.expiring?.count || 0} valueStyle={{ color: '#faad14' }} prefix={<WarningOutlined />} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Expired" value={data.expired?.count || 0} valueStyle={{ color: '#ff4d4f' }} prefix={<CloseCircleOutlined />} /></Card></Col>
    </Row>

    <Row gutter={16} style={{ marginTop: 16 }}>
      <Col span={12}>
        <Card title="Stock by Category" size="small">
          <Table dataSource={data.stock_by_category || []} rowKey="category" size="small" pagination={false}
            columns={[
              { title: 'Category', dataIndex: 'category' },
              { title: 'Qty (kg)', dataIndex: 'qty', render: v => Math.round(v) },
              { title: 'Value', dataIndex: 'value', render: v => `₹${Math.round(v)}`, sorter: (a, b) => a.value - b.value }
            ]} />
        </Card>
      </Col>
      <Col span={12}>
        <Card title="Today's Movements" size="small">
          <Table dataSource={data.today_movements || []} rowKey="movement_type" size="small" pagination={false}
            columns={[
              { title: 'Type', dataIndex: 'movement_type', render: v => <Tag>{v}</Tag> },
              { title: 'Count', dataIndex: 'count' },
              { title: 'Qty', dataIndex: 'qty', render: v => Math.round(v) }
            ]} />
        </Card>
      </Col>
    </Row>

    <Row gutter={16} style={{ marginTop: 16 }}>
      <Col span={24}>
        <Card title="Top Products by Value" size="small">
          <Table dataSource={data.top_products || []} rowKey="produce_id" size="small" pagination={false}
            columns={[
              { title: 'Product', dataIndex: 'produce_name' },
              { title: 'Qty (kg)', dataIndex: 'qty', render: v => Math.round(v) },
              { title: 'Value', dataIndex: 'value', render: v => `₹${Math.round(v)}` }
            ]} />
        </Card>
      </Col>
    </Row>
  </>
}

// ─────────────────────────────────────────────────────────────────
// STOCK BATCH VIEWER
// ─────────────────────────────────────────────────────────────────
function BatchViewer({ stores, produce }) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({})
  const [detail, setDetail] = useState(null)
  const [detailModal, setDetailModal] = useState(false)
  const [adjustModal, setAdjustModal] = useState(false)
  const [adjustForm] = Form.useForm()

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.store_id) params.set('store_id', filters.store_id)
    if (filters.produce_id) params.set('produce_id', filters.produce_id)
    if (filters.status) params.set('status', filters.status)
    if (filters.grade) params.set('grade', filters.grade)
    if (filters.age) params.set('age', filters.age)
    api.get(`/inventory/batches?${params}`).then(r => setBatches(Array.isArray(r?.data) ? r.data : [])).finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])

  const showDetail = async (id) => {
    const r = await api.get(`/inventory/batches/${id}`)
    setDetail(r.data)
    setDetailModal(true)
  }

  const handleAdjust = async (values) => {
    try {
      await api.post('/inventory/adjust', values)
      message.success('Adjustment recorded')
      setAdjustModal(false)
      adjustForm.resetFields()
      load()
    } catch (e) { message.error('Adjustment failed') }
  }

  const columns = [
    { title: 'Batch', dataIndex: 'batch_code', width: 110, render: (v, r) => <a onClick={() => showDetail(r.id)}>{v}</a> },
    { title: 'Produce', dataIndex: 'produce_name' },
    { title: 'Store', dataIndex: 'store_name' },
    { title: 'Grade', dataIndex: 'grade', width: 60, render: v => <Tag color={v === 'A' ? 'green' : v === 'B' ? 'blue' : 'orange'}>{v}</Tag> },
    { title: 'Available', dataIndex: 'available_qty', width: 80, render: v => <Text strong>{v}</Text> },
    { title: 'Free', dataIndex: 'free_qty', width: 70, render: v => <Text type="secondary">{v}</Text> },
    { title: 'Reserved', dataIndex: 'reserved_qty', width: 70, render: v => v > 0 ? <Badge count={v} size="small" /> : '-' },
    { title: 'Cost', dataIndex: 'cost_price', width: 80, render: v => `₹${v}` },
    { title: 'Received', dataIndex: 'received_date', width: 80, render: v => dayjs(v).format('DD/MM') },
    { title: 'Expiry', dataIndex: 'expiry_date', width: 80, render: (v) => v ? <Tag color={dayjs(v).diff(dayjs(), 'day') <= 2 ? 'orange' : 'default'}>{dayjs(v).format('DD/MM')}</Tag> : '-' },
    { title: 'Days Left', dataIndex: 'days_remaining', width: 70, render: v => v !== null ? <Tag color={v < 0 ? 'red' : v <= 2 ? 'orange' : 'green'}>{v !== null ? v : '-'}</Tag> : '-' },
    { title: 'Location', dataIndex: 'location_zone', width: 80 },
    { title: 'Status', dataIndex: 'status', width: 80, render: v => <Tag>{v}</Tag> },
    { title: 'Action', width: 80, render: (_, r) => <Button size="small" onClick={() => { setAdjustModal(true); adjustForm.setFieldsValue({ batch_id: r.id, store_id: r.store_id, produce_id: r.produce_id }) }}>Adjust</Button> }
  ]

  return <>
    <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      <Select placeholder="Store" allowClear style={{ width: 150 }} value={filters.store_id} onChange={v => setFilters(f => ({ ...f, store_id: v }))}>
        {stores.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
      </Select>
      <Select placeholder="Produce" allowClear showSearch style={{ width: 180 }} value={filters.produce_id} onChange={v => setFilters(f => ({ ...f, produce_id: v }))} filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}>
        {produce.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
      </Select>
      <Select placeholder="Status" allowClear style={{ width: 120 }} value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))}>
        <Select.Option value="available">Available</Select.Option>
        <Select.Option value="exhausted">Exhausted</Select.Option>
        <Select.Option value="wasted">Wasted</Select.Option>
      </Select>
      <Select placeholder="Grade" allowClear style={{ width: 100 }} value={filters.grade} onChange={v => setFilters(f => ({ ...f, grade: v }))}>
        <Select.Option value="A">A</Select.Option>
        <Select.Option value="B">B</Select.Option>
        <Select.Option value="C">C</Select.Option>
      </Select>
      <Select placeholder="Age" allowClear style={{ width: 130 }} value={filters.age} onChange={v => setFilters(f => ({ ...f, age: v }))}>
        <Select.Option value="fresh">Fresh</Select.Option>
        <Select.Option value="expiring">Expiring</Select.Option>
        <Select.Option value="expired">Expired</Select.Option>
      </Select>
      <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
    </Space>
    <Table dataSource={batches} columns={columns} rowKey="id" loading={loading} size="small" scroll={{ x: 1300 }} />

    <Modal title={`Batch Detail: ${detail?.batch_code}`} open={detailModal} onCancel={() => setDetailModal(false)} width={900} footer={null}>
      {detail && <>
        <Descriptions column={3} size="small" bordered>
          <Descriptions.Item label="Produce">{detail.produce_name}</Descriptions.Item>
          <Descriptions.Item label="Store">{detail.store_name}</Descriptions.Item>
          <Descriptions.Item label="Supplier">{detail.supplier_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="Grade"><Tag color={detail.grade === 'A' ? 'green' : 'blue'}>{detail.grade}</Tag></Descriptions.Item>
          <Descriptions.Item label="Received">{dayjs(detail.received_date).format('DD/MM/YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Expiry">{detail.expiry_date ? dayjs(detail.expiry_date).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
          <Descriptions.Item label="Received Qty">{detail.received_qty}</Descriptions.Item>
          <Descriptions.Item label="Available Qty"><Text strong>{detail.available_qty}</Text></Descriptions.Item>
          <Descriptions.Item label="Reserved">{detail.reserved_qty || 0}</Descriptions.Item>
          <Descriptions.Item label="Free Qty"><Text strong style={{ color: '#1890ff' }}>{detail.free_qty}</Text></Descriptions.Item>
          <Descriptions.Item label="Cost Price">₹{detail.cost_price}</Descriptions.Item>
          <Descriptions.Item label="Location">{detail.location_zone || '-'}</Descriptions.Item>
          <Descriptions.Item label="Status"><Tag>{detail.status}</Tag></Descriptions.Item>
        </Descriptions>
        <Divider>Weight Loss History</Divider>
        {detail.weight_loss?.length ? <Table dataSource={detail.weight_loss} rowKey="id" size="small" pagination={false} columns={[
          { title: 'Date', dataIndex: 'record_date', render: v => dayjs(v).format('DD/MM') },
          { title: 'Opening', dataIndex: 'opening_weight' },
          { title: 'Current', dataIndex: 'current_weight' },
          { title: 'Loss Type', dataIndex: 'loss_type', render: v => <Tag>{v}</Tag> }
        ]} /> : <Text type="secondary">No weight loss recorded</Text>}
        <Divider>Active Reservations</Divider>
        {detail.reservations?.length ? <Table dataSource={detail.reservations} rowKey="id" size="small" pagination={false} columns={[
          { title: 'Qty', dataIndex: 'quantity' },
          { title: 'Ref Type', dataIndex: 'reference_type' },
          { title: 'Ref Number', dataIndex: 'reference_number' },
          { title: 'Reserved At', dataIndex: 'reserved_at', render: v => dayjs(v).format('DD/MM HH:mm') }
        ]} /> : <Text type="secondary">No active reservations</Text>}
        <Divider>Movement Timeline</Divider>
        <Timeline items={detail.movements?.slice(-20).reverse().map(m => ({
          color: m.quantity > 0 ? 'green' : 'red',
          children: <>{m.movement_type} <Tag>{m.quantity > 0 ? '+' : ''}{m.quantity}</Tag> ({m.quantity_before} → {m.quantity_after}) <Text type="secondary">{dayjs(m.created_at).format('DD/MM HH:mm')}</Text></>
        })) || []} />
      </>}
    </Modal>

    <Modal title="Stock Adjustment" open={adjustModal} onCancel={() => setAdjustModal(false)} onOk={() => adjustForm.submit()} width={500}>
      <Form form={adjustForm} layout="vertical" onFinish={handleAdjust}>
        <Form.Item name="batch_id" label="Batch ID" hidden><Input /></Form.Item>
        <Form.Item name="store_id" label="Store ID" hidden><Input /></Form.Item>
        <Form.Item name="produce_id" label="Produce ID" hidden><Input /></Form.Item>
        <Form.Item name="adjustment_type" label="Adjustment Type" rules={[{ required: true }]}>
          <Select>
            <Select.Option value="weight_loss">Weight Loss</Select.Option>
            <Select.Option value="natural_shrinkage">Natural Shrinkage</Select.Option>
            <Select.Option value="moisture_loss">Moisture Loss</Select.Option>
            <Select.Option value="trimming">Trimming</Select.Option>
            <Select.Option value="spoilage">Spoilage</Select.Option>
            <Select.Option value="damage">Damage</Select.Option>
            <Select.Option value="theft">Theft</Select.Option>
            <Select.Option value="found_surplus">Found Surplus</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="quantity" label="Quantity (kg)" rules={[{ required: true }]}>
          <InputNumber min={0.01} step={0.1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="unit_cost" label="Unit Cost (overrides batch cost)">
          <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="reason" label="Reason" rules={[{ required: true }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  </>
}

// ─────────────────────────────────────────────────────────────────
// STOCK LEDGER
// ─────────────────────────────────────────────────────────────────
function StockLedger({ stores, produce }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ from: dayjs().subtract(30, 'day'), to: dayjs() })

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.store_id) params.set('store_id', filters.store_id)
    if (filters.produce_id) params.set('produce_id', filters.produce_id)
    if (filters.from) params.set('from', filters.from.format('YYYY-MM-DD'))
    if (filters.to) params.set('to', filters.to.format('YYYY-MM-DD'))
    api.get(`/inventory/stock-ledger?${params}`).then(r => {
      const d = r.data;
      setData(Array.isArray(d) ? { items: d, summary: { opening_balance: 0, total_in: 0, total_out: 0, closing_balance: 0, transaction_count: 0 } } : d);
    }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [filters])

  return <>
    <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      <Select placeholder="Store" allowClear style={{ width: 150 }} value={filters.store_id} onChange={v => setFilters(f => ({ ...f, store_id: v }))}>
        {stores.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
      </Select>
      <Select placeholder="Produce" allowClear showSearch style={{ width: 180 }} value={filters.produce_id} onChange={v => setFilters(f => ({ ...f, produce_id: v }))} filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}>
        {produce.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
      </Select>
      <DatePicker value={filters.from} onChange={v => setFilters(f => ({ ...f, from: v }))} />
      <DatePicker value={filters.to} onChange={v => setFilters(f => ({ ...f, to: v }))} />
      <Button icon={<ReloadOutlined />} onClick={load}>Load</Button>
    </Space>

    {data?.summary && <Row gutter={16} style={{ marginBottom: 12 }}>
      <Col span={4}><Card size="small"><Statistic title="Opening" value={Math.round(data.summary.opening_balance)} suffix="kg" /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Total In" value={Math.round(data.summary.total_in)} suffix="kg" valueStyle={{ color: '#52c41a' }} prefix={<ArrowDownOutlined />} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Total Out" value={Math.round(data.summary.total_out)} suffix="kg" valueStyle={{ color: '#ff4d4f' }} prefix={<ArrowUpOutlined />} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Closing" value={Math.round(data.summary.closing_balance)} suffix="kg" valueStyle={{ color: '#1890ff' }} /></Card></Col>
      <Col span={4}><Card size="small"><Statistic title="Transactions" value={data.summary.transaction_count} /></Card></Col>
    </Row>}

    <Table dataSource={data?.items || []} rowKey="id" loading={loading} size="small" scroll={{ x: 1200 }}
      columns={[
        { title: 'Date', dataIndex: 'created_at', width: 140, render: v => dayjs(v).format('DD/MM/YYYY HH:mm') },
        { title: 'Direction', dataIndex: 'direction', width: 70, render: v => <Tag color={v === 'IN' ? 'green' : v === 'OUT' ? 'red' : 'orange'}>{v}</Tag> },
        { title: 'Type', dataIndex: 'movement_type', width: 110, render: v => <Tag>{v}</Tag> },
        { title: 'Produce', dataIndex: 'produce_name' },
        { title: 'Batch', dataIndex: 'batch_code', width: 100 },
        { title: 'Store', dataIndex: 'store_name' },
        { title: 'Qty', dataIndex: 'movement_qty', width: 70, render: (v, r) => <Text strong style={{ color: r.direction === 'IN' ? '#52c41a' : '#ff4d4f' }}>{v}</Text> },
        { title: 'Running', dataIndex: 'running_balance', width: 70, render: v => <Text strong>{v}</Text> },
        { title: 'Cost', dataIndex: 'unit_cost', width: 70, render: v => `₹${v}` },
        { title: 'Total', dataIndex: 'total_value', width: 80, render: v => `₹${Math.round(v)}` },
        { title: 'Ref', dataIndex: 'ref_type', width: 80 },
        { title: 'Notes', dataIndex: 'notes', ellipsis: true }
      ]} />
  </>
}

// ─────────────────────────────────────────────────────────────────
// AGING ANALYSIS
// ─────────────────────────────────────────────────────────────────
function AgingAnalysis({ stores }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [storeFilter, setStoreFilter] = useState()

  useEffect(() => {
    setLoading(true)
    const p = storeFilter ? `?store_id=${storeFilter}` : ''
    api.get(`/inventory/aging${p}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }, [storeFilter])

  if (!data) return <Card loading />

  return <>
    <Space style={{ marginBottom: 12 }}>
      <Select placeholder="Store" allowClear style={{ width: 150 }} value={storeFilter} onChange={setStoreFilter}>
        {stores.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
      </Select>
    </Space>
    <Row gutter={16} style={{ marginBottom: 12 }}>
      {Object.entries(data.bucket_summary || {}).map(([bucket, v]) => (
        <Col span={4} key={bucket}>
          <Card size="small">
            <Statistic title={bucket} value={Math.round(v.qty)} suffix="kg" valueStyle={{ color: bucket.includes('0-1') ? '#52c41a' : bucket.includes('Expired') ? '#ff4d4f' : '#faad14' }} />
            <Text type="secondary">₹{Math.round(v.value)}</Text>
          </Card>
        </Col>
      ))}
    </Row>
    <Row gutter={16} style={{ marginBottom: 12 }}>
      {Object.entries(data.freshness_summary || {}).map(([status, v]) => (
        <Col span={4} key={status}>
          <Card size="small">
            <Statistic title={status} value={v.count} suffix="batches" valueStyle={{ color: status === 'Fresh' ? '#52c41a' : status === 'Expired' ? '#ff4d4f' : '#faad14' }} />
          </Card>
        </Col>
      ))}
    </Row>
    <Table dataSource={data.items || []} rowKey={r => r.produce_id + r.age_bucket} size="small" scroll={{ x: 1000 }}
      columns={[
        { title: 'Produce', dataIndex: 'produce_name' },
        { title: 'Category', dataIndex: 'category' },
        { title: 'Age Bucket', dataIndex: 'age_bucket' },
        { title: 'Freshness', dataIndex: 'freshness_status', render: v => <Tag color={v === 'Fresh' ? 'green' : v === 'Expired' ? 'red' : 'orange'}>{v}</Tag> },
        { title: 'Qty (kg)', dataIndex: 'available_qty', render: v => Math.round(v) },
        { title: 'Stock Value', dataIndex: 'stock_value', render: v => `₹${Math.round(v)}` },
        { title: 'Batches', dataIndex: 'batch_count' }
      ]} />
  </>
}

// ─────────────────────────────────────────────────────────────────
// VALUATION REPORT
// ─────────────────────────────────────────────────────────────────
function ValuationReport({ stores }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [storeFilter, setStoreFilter] = useState()

  useEffect(() => {
    setLoading(true)
    const p = storeFilter ? `?store_id=${storeFilter}` : ''
    api.get(`/inventory/valuation${p}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }, [storeFilter])

  if (!data) return <Card loading />

  return <>
    <Space style={{ marginBottom: 12 }}>
      <Select placeholder="Store" allowClear style={{ width: 150 }} value={storeFilter} onChange={setStoreFilter}>
        {stores.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
      </Select>
    </Space>
    <Row gutter={16} style={{ marginBottom: 12 }}>
      <Col span={6}><Card size="small"><Statistic title="Total Qty" value={Math.round(data.totalQuantity || 0)} suffix="kg" /></Card></Col>
      <Col span={6}><Card size="small"><Statistic title="FIFO Value" value={Math.round(data.fifoValue || 0)} prefix="₹" /></Card></Col>
      <Col span={6}><Card size="small"><Statistic title="Weighted Avg Value" value={Math.round(data.weightedAverage || 0)} prefix="₹" /></Card></Col>
      <Col span={6}><Card size="small"><Statistic title="Variance" value={Math.round((data.fifoValue || 0) - (data.weightedAverage || 0))} prefix="₹" valueStyle={{ color: Math.abs((data.fifoValue || 0) - (data.weightedAverage || 0)) > 100 ? '#faad14' : '#52c41a' }} /></Card></Col>
    </Row>
    <Table dataSource={Array.isArray(data.details) ? data.details : []} rowKey="id" size="small" scroll={{ x: 1000 }}
      columns={[
        { title: 'Produce', dataIndex: 'product' },
        { title: 'Category', render: () => '-' },
        { title: 'Store', render: () => '-' },
        { title: 'Total Qty', dataIndex: 'availableQty', render: v => Math.round(v) },
        { title: 'FIFO Cost', dataIndex: 'unitCost', render: v => `₹${Number(v)?.toFixed(2)}` },
        { title: 'FIFO Value', dataIndex: 'fifoValue', render: v => `₹${Math.round(v)}` },
        { title: 'WA Cost', render: () => '-' },
        { title: 'Batches', render: () => 1 },
        { title: 'Oldest Batch', dataIndex: 'receivedDate', render: v => v ? dayjs(v).format('DD/MM') : '-' }
      ]} />
  </>
}

// ─────────────────────────────────────────────────────────────────
// WEIGHT LOSS TRACKER
// ─────────────────────────────────────────────────────────────────
function WeightLossTracker({ stores }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({})

  useEffect(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filters.store_id) p.set('store_id', filters.store_id)
    if (filters.from) p.set('from', filters.from)
    if (filters.to) p.set('to', filters.to)
    api.get(`/inventory/weight-loss?${p}`).then(r => setData(Array.isArray(r?.data) ? r.data : [])).finally(() => setLoading(false))
  }, [filters])

  return <>
    <Space style={{ marginBottom: 12 }}>
      <Select placeholder="Store" allowClear style={{ width: 150 }} value={filters.store_id} onChange={v => setFilters(f => ({ ...f, store_id: v }))}>
        {stores.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
      </Select>
      <DatePicker onChange={v => setFilters(f => ({ ...f, from: v?.format('YYYY-MM-DD') }))} placeholder="From" />
      <DatePicker onChange={v => setFilters(f => ({ ...f, to: v?.format('YYYY-MM-DD') }))} placeholder="To" />
    </Space>
    <Table dataSource={data} rowKey="id" loading={loading} size="small" scroll={{ x: 1000 }}
      columns={[
        { title: 'Date', dataIndex: 'record_date', render: v => dayjs(v).format('DD/MM/YYYY') },
        { title: 'Produce', dataIndex: 'produce_name' },
        { title: 'Batch', dataIndex: 'batch_code' },
        { title: 'Store', dataIndex: 'store_name' },
        { title: 'Opening', dataIndex: 'opening_weight', render: v => v?.toFixed(2) },
        { title: 'Current', dataIndex: 'current_weight', render: v => v?.toFixed(2) },
        { title: 'Loss', render: (_, r) => <Text strong style={{ color: '#ff4d4f' }}>{(r.opening_weight - r.current_weight)?.toFixed(2)}</Text> },
        { title: 'Loss %', render: (_, r) => r.opening_weight > 0 ? <Tag color="orange">{((r.opening_weight - r.current_weight) / r.opening_weight * 100)?.toFixed(1)}%</Tag> : '-' },
        { title: 'Type', dataIndex: 'loss_type', render: v => <Tag>{v}</Tag> },
        { title: 'Notes', dataIndex: 'notes', ellipsis: true }
      ]} />
  </>
}

// ─────────────────────────────────────────────────────────────────
// TRANSFER MANAGER
// ─────────────────────────────────────────────────────────────────
function TransferManager({ stores }) {
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailModal, setDetailModal] = useState(false)
  const [form] = Form.useForm()
  const [batches, setBatches] = useState([])

  const load = () => {
    setLoading(true)
    api.get('/inventory/transfers').then(r => setTransfers(Array.isArray(r?.data) ? r.data : [])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const startTransfer = async () => {
    try {
      const r = await api.get('/inventory/batches?status=available')
      setBatches(Array.isArray(r?.data) ? r.data.filter(b => b.available_qty > 0) : [])
      setModal(true)
    } catch (e) { message.error('Failed to load batches') }
  }

  const createTransfer = async (values) => {
    try {
      await api.post('/inventory/transfer', values)
      message.success('Transfer created')
      setModal(false)
      load()
    } catch (e) { message.error('Transfer failed') }
  }

  const dispatchTransfer = async (id) => {
    try {
      await api.put(`/inventory/transfer/${id}/dispatch`)
      message.success('Transfer dispatched')
      load()
    } catch (e) { message.error('Dispatch failed') }
  }

  const receiveTransfer = async (id) => {
    try {
      await api.put(`/inventory/transfer/${id}/receive`)
      message.success('Transfer received')
      load()
    } catch (e) { message.error('Receive failed') }
  }

  const showDetail = async (id) => {
    try {
      const r = await api.get(`/inventory/transfers/${id}`)
      setDetail(r.data)
      setDetailModal(true)
    } catch (e) { message.error('Failed to load transfer details') }
  }

  return <>
    <Space style={{ marginBottom: 12 }}>
      <Button type="primary" icon={<SwapOutlined />} onClick={startTransfer}>New Transfer</Button>
      <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
    </Space>
    <Table dataSource={transfers} rowKey="id" loading={loading} size="small" scroll={{ x: 1000 }}
      columns={[
        { title: 'Transfer #', dataIndex: 'transfer_number', render: (v, r) => <a onClick={() => showDetail(r.id)}>{v}</a> },
        { title: 'From', dataIndex: 'source_name' },
        { title: 'To', dataIndex: 'dest_name' },
        { title: 'Date', dataIndex: 'transfer_date', render: v => dayjs(v).format('DD/MM/YYYY') },
        { title: 'Items', dataIndex: 'total_items' },
        { title: 'Value', dataIndex: 'total_value', render: v => `₹${Math.round(v)}` },
        { title: 'Status', dataIndex: 'status', render: v => <Tag color={v === 'draft' ? 'default' : v === 'dispatched' ? 'blue' : 'green'}>{v}</Tag> },
        { title: 'Action', render: (_, r) => <Space>
          {r.status === 'draft' && <Button size="small" type="primary" onClick={() => dispatchTransfer(r.id)} icon={<SendOutlined />}>Dispatch</Button>}
          {r.status === 'dispatched' && <Button size="small" type="primary" onClick={() => receiveTransfer(r.id)} icon={<DownloadOutlined />}>Receive</Button>}
        </Space> }
      ]} />

    <Modal title="New Transfer" open={modal} onCancel={() => setModal(false)} width={700} footer={null}>
      <TransferForm stores={stores} batches={batches} onSubmit={createTransfer} />
    </Modal>

    <Modal title={`Transfer: ${detail?.transfer_number}`} open={detailModal} onCancel={() => setDetailModal(false)} width={700} footer={null}>
      {detail && <>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="From">{detail.source_name}</Descriptions.Item>
          <Descriptions.Item label="To">{detail.dest_name}</Descriptions.Item>
          <Descriptions.Item label="Date">{dayjs(detail.transfer_date).format('DD/MM/YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Status"><Tag>{detail.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="Value">₹{Math.round(detail.total_value)}</Descriptions.Item>
          <Descriptions.Item label="Items">{detail.total_items}</Descriptions.Item>
        </Descriptions>
        <Divider />
        <Table dataSource={detail.items || []} rowKey="id" size="small" pagination={false}
          columns={[
            { title: 'Produce', dataIndex: 'produce_name' },
            { title: 'Batch', dataIndex: 'batch_code' },
            { title: 'Grade', dataIndex: 'grade' },
            { title: 'Qty', dataIndex: 'transfer_qty' },
            { title: 'Cost', dataIndex: 'unit_cost', render: v => `₹${v}` },
            { title: 'Total', dataIndex: 'total_cost', render: v => `₹${Math.round(v)}` }
          ]} />
      </>}
    </Modal>
  </>
}

function TransferForm({ stores, batches, onSubmit }) {
  const [items, setItems] = useState([{ produce_id: '', batch_id: '', qty: '' }])
  const [sourceStore, setSourceStore] = useState()

  const availableBatches = batches.filter(b => !sourceStore || b.store_id === sourceStore)

  const addItem = () => setItems([...items, { produce_id: '', batch_id: '', qty: '' }])
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i))
  const updateItem = (i, k, v) => {
    const copy = [...items]; copy[i] = { ...copy[i], [k]: v }
    if (k === 'batch_id') {
      const batch = batches.find(b => b.id === v)
      if (batch) { copy[i].produce_id = batch.produce_id }
    }
    setItems(copy)
  }

  const handleSubmit = () => {
    if (!sourceStore) return message.error('Select source store')
    onSubmit({
      source_store_id: sourceStore,
      dest_store_id: items[0]?.dest_store_id,
      items: items.map(i => ({ batch_id: i.batch_id, produce_id: i.produce_id, qty: parseFloat(i.qty) })),
      notes: items[0]?.notes
    })
  }

  return <Form layout="vertical">
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item label="Source Store" required>
          <Select value={sourceStore} onChange={v => { setSourceStore(v); setItems([{ produce_id: '', batch_id: '', qty: '', dest_store_id: '' }]) }}>
            {stores.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
          </Select>
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="Destination Store" required>
          <Select value={items[0]?.dest_store_id} onChange={v => updateItem(0, 'dest_store_id', v)}>
            {stores.filter(s => s.id !== sourceStore).map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
          </Select>
        </Form.Item>
      </Col>
    </Row>

    {items.map((item, i) => <Row gutter={8} key={i} style={{ marginBottom: 8 }}>
      <Col span={8}>
        <Select placeholder="Batch" showSearch value={item.batch_id} onChange={v => updateItem(i, 'batch_id', v)} style={{ width: '100%' }} filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}>
          {availableBatches.map(b => <Select.Option key={b.id} value={b.id}>{b.batch_code} - {b.produce_name} ({b.available_qty}kg @ ₹{b.cost_price})</Select.Option>)}
        </Select>
      </Col>
      <Col span={4}>
        <InputNumber placeholder="Qty" value={item.qty} onChange={v => updateItem(i, 'qty', v)} min={0.1} step={0.5} style={{ width: '100%' }} />
      </Col>
      <Col span={2}>
        {items.length > 1 && <Button danger size="small" onClick={() => removeItem(i)} icon={<CloseCircleOutlined />} />}
      </Col>
    </Row>)}
    <Button type="dashed" onClick={addItem} block icon={<PlusOutlined />}>Add Item</Button>
    <Divider />
    <Form.Item label="Notes">
      <Input.TextArea value={items[0]?.notes} onChange={v => updateItem(0, 'notes', v.target.value)} rows={2} />
    </Form.Item>
    <Button type="primary" onClick={handleSubmit} block>Create Transfer</Button>
  </Form>
}

// ─────────────────────────────────────────────────────────────────
// RESERVATION DASHBOARD
// ─────────────────────────────────────────────────────────────────
function ReservationDashboard({ stores }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [storeFilter, setStoreFilter] = useState()
  const [releaseModal, setReleaseModal] = useState(false)
  const [selectedResv, setSelectedResv] = useState(null)

  const load = () => {
    setLoading(true)
    const p = storeFilter ? `?store_id=${storeFilter}` : ''
    api.get(`/inventory/reservations${p}`).then(r => setData(Array.isArray(r?.data) ? r.data : [])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [storeFilter])

  const releaseReservation = async () => {
    try {
      await api.post('/inventory/release', { reservation_id: selectedResv.id })
      message.success('Reservation released')
      setReleaseModal(false)
      load()
    } catch (e) { message.error('Release failed') }
  }

  return <>
    <Space style={{ marginBottom: 12 }}>
      <Select placeholder="Store" allowClear style={{ width: 150 }} value={storeFilter} onChange={setStoreFilter}>
        {stores.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
      </Select>
      <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
    </Space>
    <Table dataSource={data} rowKey="id" loading={loading} size="small" scroll={{ x: 1000 }}
      columns={[
        { title: 'Produce', dataIndex: 'produce_name' },
        { title: 'Store', dataIndex: 'store_name' },
        { title: 'Qty', dataIndex: 'quantity', render: v => <Text strong>{v}</Text> },
        { title: 'Ref Type', dataIndex: 'reference_type', render: v => <Tag>{v}</Tag> },
        { title: 'Ref #', dataIndex: 'reference_number' },
        { title: 'Reserved At', dataIndex: 'reserved_at', render: v => dayjs(v).format('DD/MM/YYYY HH:mm') },
        { title: 'Status', dataIndex: 'status', render: v => <Tag color={v === 'active' ? 'blue' : v === 'released' ? 'green' : 'default'}>{v}</Tag> },
        { title: 'Action', render: (_, r) => r.status === 'active' ? <Button size="small" danger onClick={() => { setSelectedResv(r); setReleaseModal(true) }}>Release</Button> : null }
      ]} />

    <Modal title="Release Reservation" open={releaseModal} onCancel={() => setReleaseModal(false)} onOk={releaseReservation}>
      <p>Release <Text strong>{selectedResv?.quantity} kg</Text> of <Text strong>{selectedResv?.produce_name}</Text>?</p>
    </Modal>
  </>
}

// ─────────────────────────────────────────────────────────────────
// SCANNING INTERFACE
// ─────────────────────────────────────────────────────────────────
function ScanningInterface() {
  const [scanInput, setScanInput] = useState('')
  const [result, setResult] = useState(null)
  const [identifiers, setIdentifiers] = useState([])

  const handleScan = async () => {
    if (!scanInput.trim()) return
    try {
      const r = await api.post('/inventory/scan', { identifier: scanInput.trim(), identifier_type: 'barcode' })
      setResult(r.data)
      if (r.data.found) message.success(`Found: ${r.data.batch?.produce_name || 'batch'}`)
      else message.info('New identifier registered')
      loadIdentifiers()
    } catch (e) { message.error('Scan failed') }
  }

  const loadIdentifiers = () => {
    api.get('/inventory/identifiers').then(r => setIdentifiers(Array.isArray(r?.data) ? r.data : [])).catch(() => {})
  }
  useEffect(() => { loadIdentifiers() }, [])

  return <>
    <Alert message="Scan barcode, QR code, or RFID tag. Type identifier below for simulation." type="info" showIcon style={{ marginBottom: 12 }} />
    <Space style={{ marginBottom: 12 }}>
      <Input.Search
        placeholder="Scan / type identifier..."
        value={scanInput}
        onChange={e => setScanInput(e.target.value)}
        onSearch={handleScan}
        enterButton={<><ScanOutlined /> Scan</>}
        style={{ width: 400 }}
        prefix={<BarcodeOutlined />}
      />
    </Space>

    {result && <Card size="small" title="Scan Result" style={{ marginBottom: 12 }}>
      {result.found ? <>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="Identifier">{result.identifier?.identifier}</Descriptions.Item>
          <Descriptions.Item label="Type">{result.identifier?.identifier_type}</Descriptions.Item>
          <Descriptions.Item label="Produce">{result.batch?.produce_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="Batch">{result.batch?.batch_code || '-'}</Descriptions.Item>
          <Descriptions.Item label="Available">{result.batch?.available_qty || '-'} kg</Descriptions.Item>
          <Descriptions.Item label="Cost Price">₹{result.batch?.cost_price || '-'}</Descriptions.Item>
        </Descriptions>
      </> : <Text>New identifier registered: <Tag>{result.id}</Tag></Text>}
    </Card>}

    <Divider>Registered Identifiers</Divider>
    <Table dataSource={identifiers} rowKey="id" size="small" columns={[
      { title: 'Identifier', dataIndex: 'identifier' },
      { title: 'Type', dataIndex: 'identifier_type', render: v => <Tag>{v}</Tag> },
      { title: 'Produce', dataIndex: 'produce_name' },
      { title: 'Batch', dataIndex: 'batch_code' },
      { title: 'Created', dataIndex: 'created_at', render: v => dayjs(v).format('DD/MM/YYYY') }
    ]} />
  </>
}

// ─────────────────────────────────────────────────────────────────
// DAILY CLOSING
// ─────────────────────────────────────────────────────────────────
function DailyClosing({ stores }) {
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(false)
  const [storeFilter, setStoreFilter] = useState()
  const [dateRange, setDateRange] = useState([dayjs().subtract(7, 'day'), dayjs()])
  const [closingDate, setClosingDate] = useState(dayjs())
  const [closingDetail, setClosingDetail] = useState(null)
  const [detailModal, setDetailModal] = useState(false)

  const load = () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (storeFilter) p.set('store_id', storeFilter)
    if (dateRange[0]) p.set('from', dateRange[0].format('YYYY-MM-DD'))
    if (dateRange[1]) p.set('to', dateRange[1].format('YYYY-MM-DD'))
    api.get(`/inventory/daily-closing?${p}`).then(r => setSnapshots(Array.isArray(r?.data) ? r.data : [])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [storeFilter, dateRange])

  const computeClosing = async () => {
    try {
      await api.post('/inventory/daily-closing', { store_id: storeFilter, closing_date: closingDate.format('YYYY-MM-DD') })
      message.success('Daily closing computed')
      load()
    } catch (e) { message.error('Daily closing failed') }
  }

  const showDetail = async (date) => {
    const r = await api.get(`/inventory/daily-closing/${date}` + (storeFilter ? `/${storeFilter}` : ''))
    setClosingDetail({ date, items: r.data })
    setDetailModal(true)
  }

  return <>
    <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      <Select placeholder="Store" allowClear style={{ width: 150 }} value={storeFilter} onChange={setStoreFilter}>
        {stores.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
      </Select>
      <DatePicker value={dateRange[0]} onChange={v => setDateRange([v, dateRange[1]])} />
      <DatePicker value={dateRange[1]} onChange={v => setDateRange([dateRange[0], v])} />
      <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
    </Space>

    <Card size="small" style={{ marginBottom: 12 }}>
      <Space>
        <DatePicker value={closingDate} onChange={setClosingDate} />
        <Button type="primary" onClick={computeClosing} icon={<FileTextOutlined />}>Compute Daily Closing</Button>
      </Space>
    </Card>

    <Table dataSource={snapshots} rowKey="id" loading={loading} size="small" scroll={{ x: 1000 }}
      columns={[
        { title: 'Date', dataIndex: 'snapshot_date', render: (v) => <a onClick={() => showDetail(v)}>{dayjs(v).format('DD/MM/YYYY')}</a> },
        { title: 'Store', dataIndex: 'store_name' },
        { title: 'Opening', dataIndex: 'total_opening_qty', render: v => Math.round(v) },
        { title: 'Purchases', dataIndex: 'total_purchases_qty', render: v => Math.round(v) },
        { title: 'Sales', dataIndex: 'total_sales_qty', render: v => Math.round(v) },
        { title: 'Spoilage', dataIndex: 'total_spoilage_qty', render: v => v > 0 ? <Text style={{ color: '#ff4d4f' }}>{Math.round(v)}</Text> : <Text type="secondary">0</Text> },
        { title: 'Weight Loss', dataIndex: 'total_weight_loss_qty', render: v => v > 0 ? <Text style={{ color: '#faad14' }}>{Math.round(v)}</Text> : '-' },
        { title: 'Closing', dataIndex: 'total_closing_qty', render: v => <Text strong>{Math.round(v)}</Text> },
        { title: 'Stock Value', dataIndex: 'total_stock_value', render: v => `₹${Math.round(v)}` }
      ]} />

    <Modal title={`Daily Closing: ${closingDetail?.date}`} open={detailModal} onCancel={() => setDetailModal(false)} width={900} footer={null}>
      {closingDetail && <Table dataSource={closingDetail.items} rowKey="batch_id" size="small"
        columns={[
          { title: 'Produce', dataIndex: 'produce_name' },
          { title: 'Category', dataIndex: 'category' },
          { title: 'Opening', dataIndex: 'opening_qty', render: v => Math.round(v) },
          { title: 'Purchases', dataIndex: 'purchases_qty', render: v => Math.round(v) },
          { title: 'Sales', dataIndex: 'sales_qty', render: v => Math.round(v) },
          { title: 'Spoilage', dataIndex: 'spoilage_qty', render: v => v > 0 ? <Text style={{ color: '#ff4d4f' }}>{Math.round(v)}</Text> : '-' },
          { title: 'Weight Loss', dataIndex: 'weight_loss_qty', render: v => v > 0 ? <Text style={{ color: '#faad14' }}>{Math.round(v)}</Text> : '-' },
          { title: 'Closing', dataIndex: 'closing_qty', render: v => <Text strong>{Math.round(v)}</Text> },
          { title: 'Value', dataIndex: 'stock_value', render: v => `₹${Math.round(v)}` }
        ]} />}
    </Modal>
  </>
}

// ─────────────────────────────────────────────────────────────────
// MAIN INVENTORY PAGE
// ─────────────────────────────────────────────────────────────────
export default function Inventory() {
  const [stores, setStores] = useState([])
  const [produce, setProduce] = useState([])

  useEffect(() => {
    Promise.all([
      api.get('/masterdata/stores'),
      api.get('/masterdata/produce')
    ]).then(([s, p]) => {
      setStores(Array.isArray(s?.data) ? s.data : [])
      setProduce(Array.isArray(p?.data) ? p.data : [])
    }).catch(() => {})
  }, [])

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', children: <InventoryDashboard stores={stores} /> },
    { key: 'batches', label: 'Stock Batches', children: <BatchViewer stores={stores} produce={produce} /> },
    { key: 'ledger', label: 'Stock Ledger', children: <StockLedger stores={stores} produce={produce} /> },
    { key: 'aging', label: 'Aging Analysis', children: <AgingAnalysis stores={stores} /> },
    { key: 'valuation', label: 'Valuation', children: <ValuationReport stores={stores} /> },
    { key: 'weight-loss', label: 'Weight Loss', children: <WeightLossTracker stores={stores} /> },
    { key: 'transfers', label: 'Transfers', children: <TransferManager stores={stores} /> },
    { key: 'reservations', label: 'Reservations', children: <ReservationDashboard stores={stores} /> },
    { key: 'scanning', label: 'Scanning', children: <ScanningInterface /> },
    { key: 'daily-closing', label: 'Daily Closing', children: <DailyClosing stores={stores} /> },
  ]

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Inventory Management</Title>
      <Tabs items={tabs} />
    </div>
  )
}
