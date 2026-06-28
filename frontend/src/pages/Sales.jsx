import React, { useState, useEffect } from 'react'
import { Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, Space, message, Tag, DatePicker, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined, SendOutlined, CheckCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'

export default function Sales() {
  const [retailTxns, setRetailTxns] = useState([]);
  const [orders, setOrders] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [returns, setReturns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [produce, setProduce] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [returnModal, setReturnModal] = useState(false);
  const [retailModal, setRetailModal] = useState(false);
  const [contractModal, setContractModal] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/sales/retail?limit=50'),
      api.get('/sales/orders'),
      api.get('/sales/contracts'),
      api.get('/sales/returns'),
      api.get('/customers'),
      api.get('/masterdata/produce'),
      api.get('/masterdata/stores'),
    ]).then(([r, o, ct, ret, cus, p, s]) => {
      setRetailTxns(r.data);
      setOrders(o.data);
      setContracts(ct.data);
      setReturns(ret.data);
      setCustomers(cus.data);
      setProduce(p.data);
      setStores(s.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createOrder = async (values) => {
    try {
      const items = values.items.map(i => ({
        produce_id: i.produce_id, ordered_qty: i.qty, unit_price: i.price, grade_required: i.grade || 'A'
      }));
      await api.post('/sales/orders', { ...values, items });
      message.success('Order created');
      setOrderModal(false);
      load();
    } catch (err) { message.error(err.response?.data?.error || 'Error'); }
  };

  const createRetail = async (values) => {
    try {
      const items = values.items.map(i => ({
        produce_id: i.produce_id, quantity: i.qty, unit_price: i.price, batch_id: i.batch_id
      }));
      await api.post('/sales/retail', { ...values, items, payment_method: values.payment_method || 'cash' });
      message.success('Sale completed');
      setRetailModal(false);
      load();
    } catch (err) { message.error(err.response?.data?.error || 'Error'); }
  };

  const createReturn = async (values) => {
    try {
      const items = values.items.map(i => ({
        produce_id: i.produce_id, quantity: i.qty, unit_price: i.price, refund_amount: i.refund, condition: i.condition || 'spoiled'
      }));
      await api.post('/sales/returns', { ...values, items });
      message.success('Return recorded');
      setReturnModal(false);
      load();
    } catch (err) { message.error(err.response?.data?.error || 'Error'); }
  };

  const hotelCustomers = customers.filter(c => c.customer_type === 'hotel');

  const retailColumns = [
    { title: 'Txn #', dataIndex: 'transaction_number' },
    { title: 'Store', dataIndex: 'store_name' },
    { title: 'Amount', dataIndex: 'net_amount', render: v => `₹${v}` },
    { title: 'Payment', dataIndex: 'payment_method', render: v => <Tag>{v}</Tag> },
    { title: 'Cashier', dataIndex: 'cashier_name' },
    { title: 'Time', dataIndex: 'created_at', render: v => dayjs(v).format('DD/MM HH:mm') },
  ];

  const orderColumns = [
    { title: 'Order #', dataIndex: 'order_number' },
    { title: 'Customer', dataIndex: 'customer_name' },
    { title: 'Store', dataIndex: 'store_name' },
    { title: 'Amount', dataIndex: 'net_amount', render: v => `₹${v}` },
    { title: 'Status', dataIndex: 'status', render: v => <Tag color={v === 'delivered' ? 'green' : v === 'dispatched' ? 'blue' : v === 'confirmed' ? 'orange' : 'default'}>{v}</Tag> },
    { title: 'Payment', dataIndex: 'payment_status', render: v => <Tag color={v === 'paid' ? 'green' : v === 'partially_paid' ? 'orange' : 'red'}>{v}</Tag> },
    { title: 'Date', dataIndex: 'order_date', render: v => dayjs(v).format('DD/MM') },
    { render: (_, r) => <Button size="small" onClick={() => api.put(`/sales/orders/${r.id}/status`, { status: 'delivered' }).then(() => { message.success('Status updated'); load(); })}>Deliver</Button> }
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="Today Retail" value={retailTxns.filter(t => dayjs(t.created_at).isSame(dayjs(), 'day')).reduce((s, t) => s + t.net_amount, 0)} prefix="₹" /></Card></Col>
        <Col span={6}><Card><Statistic title="Active Orders" value={orders.filter(o => !['delivered','cancelled'].includes(o.status)).length} /></Card></Col>
        <Col span={6}><Card><Statistic title="Active Contracts" value={contracts.filter(c => c.status === 'active').length} /></Card></Col>
        <Col span={6}><Card><Statistic title="Returns (Today)" value={returns.filter(r => dayjs(r.return_date).isSame(dayjs(), 'day')).length} /></Card></Col>
      </Row>

      <Tabs items={[
        { key: 'retail', label: 'Retail Sales', children: <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setRetailModal(true)} style={{ marginBottom: 16 }}>New Sale</Button>
          <Table dataSource={retailTxns} columns={retailColumns} rowKey="id" loading={loading} size="small" />
        </> },
        { key: 'hotel', label: 'Hotel Orders', children: <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOrderModal(true)} style={{ marginBottom: 16 }}>New Order</Button>
          <Table dataSource={orders} columns={orderColumns} rowKey="id" loading={loading} size="small" />
        </> },
        { key: 'contracts', label: 'Contracts', children: <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setContractModal(true)} style={{ marginBottom: 16 }}>New Contract</Button>
          <Table dataSource={contracts} rowKey="id" loading={loading} size="small"
            columns={[
              { title: 'Contract #', dataIndex: 'contract_number' },
              { title: 'Customer', dataIndex: 'customer_name' },
              { title: 'Period', render: (_, r) => `${dayjs(r.start_date).format('DD/MM')} - ${dayjs(r.end_date).format('DD/MM')}` },
              { title: 'Credit Days', dataIndex: 'payment_term_days' },
              { title: 'Discount %', dataIndex: 'discount_pct', render: v => `${v}%` },
              { title: 'Status', dataIndex: 'status', render: v => <Tag color={v === 'active' ? 'green' : 'red'}>{v}</Tag> },
            ]} />
        </> },
        { key: 'returns', label: 'Returns', children: <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setReturnModal(true)} style={{ marginBottom: 16 }}>New Return</Button>
          <Table dataSource={returns} rowKey="id" loading={loading} size="small"
            columns={[
              { title: 'Return #', dataIndex: 'return_number' },
              { title: 'Customer', dataIndex: 'customer_name' },
              { title: 'Refund', dataIndex: 'total_refund', render: v => `₹${v}` },
              { title: 'Reason', dataIndex: 'reason' },
              { title: 'Resolution', dataIndex: 'resolution', render: v => <Tag>{v}</Tag> },
              { title: 'Date', dataIndex: 'return_date', render: v => dayjs(v).format('DD/MM') },
            ]} />
        </> },
      ]} />

      {/* New Order Modal */}
      <Modal title="New Hotel Order" open={orderModal} onCancel={() => setOrderModal(false)} footer={null} width={600}>
        <Form layout="vertical" onFinish={createOrder}>
          <Form.Item name="customer_id" label="Hotel" rules={[{ required: true }]}>
            <Select options={hotelCustomers.map(c => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="store_id" label="Store" rules={[{ required: true }]}>
            <Select options={stores.map(s => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="delivery_date" label="Delivery Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.List name="items">
            {(fields, { add, remove }) => (<>
              {fields.map(({ key, name, ...rest }) => (
                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item {...rest} name={[name, 'produce_id']} rules={[{ required: true }]}>
                    <Select options={produce.map(p => ({ value: p.id, label: p.name }))} placeholder="Produce" style={{ width: 150 }} />
                  </Form.Item>
                  <Form.Item {...rest} name={[name, 'qty']} rules={[{ required: true }]}>
                    <InputNumber placeholder="Qty" min={0.1} step={0.5} />
                  </Form.Item>
                  <Form.Item {...rest} name={[name, 'price']} rules={[{ required: true }]}>
                    <InputNumber placeholder="Price" min={0} prefix="₹" />
                  </Form.Item>
                  <Button onClick={() => remove(name)}>Remove</Button>
                </Space>
              ))}
              <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Add Item</Button>
            </>)}
          </Form.List>
          <Button type="primary" htmlType="submit" block style={{ marginTop: 16 }}>Create Order</Button>
        </Form>
      </Modal>

      {/* New Retail Sale Modal */}
      <Modal title="New Retail Sale" open={retailModal} onCancel={() => setRetailModal(false)} footer={null} width={500}>
        <Form layout="vertical" onFinish={createRetail}>
          <Form.Item name="store_id" label="Store" rules={[{ required: true }]}>
            <Select options={stores.map(s => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="payment_method" label="Payment Method" initialValue="cash">
            <Select options={[{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }]} />
          </Form.Item>
          <Form.List name="items">
            {(fields, { add, remove }) => (<>
              {fields.map(({ key, name, ...rest }) => (
                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item {...rest} name={[name, 'produce_id']} rules={[{ required: true }]}>
                    <Select options={produce.map(p => ({ value: p.id, label: p.name }))} placeholder="Produce" style={{ width: 150 }} showSearch />
                  </Form.Item>
                  <Form.Item {...rest} name={[name, 'qty']} rules={[{ required: true }]}>
                    <InputNumber placeholder="Qty" min={0.01} step={0.1} />
                  </Form.Item>
                  <Form.Item {...rest} name={[name, 'price']} rules={[{ required: true }]}>
                    <InputNumber placeholder="Price" min={0} prefix="₹" />
                  </Form.Item>
                  <Button onClick={() => remove(name)}>X</Button>
                </Space>
              ))}
              <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Add Item</Button>
            </>)}
          </Form.List>
          <Button type="primary" htmlType="submit" block style={{ marginTop: 16 }}>Complete Sale</Button>
        </Form>
      </Modal>

      {/* New Return Modal */}
      <Modal title="New Return" open={returnModal} onCancel={() => setReturnModal(false)} footer={null} width={500}>
        <Form layout="vertical" onFinish={createReturn}>
          <Form.Item name="store_id" label="Store" rules={[{ required: true }]}>
            <Select options={stores.map(s => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="customer_id" label="Customer">
            <Select allowClear options={customers.map(c => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="reason" label="Reason">
            <Input.TextArea />
          </Form.Item>
          <Form.List name="items">
            {(fields, { add, remove }) => (<>
              {fields.map(({ key, name, ...rest }) => (
                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item {...rest} name={[name, 'produce_id']} rules={[{ required: true }]}>
                    <Select options={produce.map(p => ({ value: p.id, label: p.name }))} placeholder="Produce" style={{ width: 150 }} />
                  </Form.Item>
                  <Form.Item {...rest} name={[name, 'qty']} rules={[{ required: true }]}>
                    <InputNumber placeholder="Qty" min={0.01} />
                  </Form.Item>
                  <Form.Item {...rest} name={[name, 'refund']} rules={[{ required: true }]}>
                    <InputNumber placeholder="Refund" min={0} prefix="₹" />
                  </Form.Item>
                  <Button onClick={() => remove(name)}>X</Button>
                </Space>
              ))}
              <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Add Item</Button>
            </>)}
          </Form.List>
          <Button type="primary" htmlType="submit" block style={{ marginTop: 16 }}>Record Return</Button>
        </Form>
      </Modal>

      {/* New Contract Modal */}
      <Modal title="New Contract" open={contractModal} onCancel={() => setContractModal(false)} footer={null} width={600}>
        <Form layout="vertical" onFinish={(values) => api.post('/sales/contracts', values).then(() => { message.success('Contract created'); setContractModal(false); load(); }).catch(err => message.error(err.response?.data?.error))}>
          <Form.Item name="customer_id" label="Hotel" rules={[{ required: true }]}>
            <Select options={hotelCustomers.map(c => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Space>
            <Form.Item name="start_date" label="Start" rules={[{ required: true }]}>
              <DatePicker />
            </Form.Item>
            <Form.Item name="end_date" label="End" rules={[{ required: true }]}>
              <DatePicker />
            </Form.Item>
            <Form.Item name="payment_term_days" label="Credit Days" initialValue={15}>
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="discount_pct" label="Discount %" initialValue={0}>
              <InputNumber min={0} max={100} />
            </Form.Item>
          </Space>
          <Form.Item name="credit_limit" label="Credit Limit">
            <InputNumber min={0} prefix="₹" style={{ width: '100%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Create Contract</Button>
        </Form>
      </Modal>
    </div>
  );
}
