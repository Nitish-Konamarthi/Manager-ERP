import React, { useState, useEffect } from 'react'
import { Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, Space, message, Tag, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'

export default function Procurement() {
  const [pos, setPos] = useState([]);
  const [grns, setGrns] = useState([]);
  const [waste, setWaste] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [produce, setProduce] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [poModal, setPoModal] = useState(false);
  const [grnModal, setGrnModal] = useState(false);
  const [wasteModal, setWasteModal] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/procurement/purchase-orders'),
      api.get('/procurement/goods-receipts'),
      api.get('/procurement/waste'),
      api.get('/suppliers'),
      api.get('/masterdata/produce'),
      api.get('/masterdata/stores'),
    ]).then(([p, g, w, sup, pro, s]) => {
      setPos(p.data);
      setGrns(g.data);
      setWaste(w.data);
      setSuppliers(sup.data);
      setProduce(pro.data);
      setStores(s.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createPO = async (values) => {
    try {
      const items = values.items.map(i => ({ produce_id: i.produce_id, ordered_qty: i.qty, unit_cost: i.cost }));
      await api.post('/procurement/purchase-orders', { ...values, items });
      message.success('PO created');
      setPoModal(false);
      load();
    } catch (err) { message.error(err.response?.data?.error || 'Error'); }
  };

  const createGRN = async (values) => {
    try {
      const items = values.items.map(i => ({ produce_id: i.produce_id, received_qty: i.qty, unit_cost: i.cost, grade: i.grade || 'A', rejected_qty: i.rejected || 0, reject_reason: i.reject_reason, po_item_id: i.po_item_id, shelf_life_days: i.shelf_life || 7 }));
      await api.post('/procurement/goods-receipts', { ...values, items });
      message.success('GRN recorded');
      setGrnModal(false);
      load();
    } catch (err) { message.error(err.response?.data?.error || 'Error'); }
  };

  const createWaste = async (values) => {
    try {
      const items = values.items.map(i => ({ produce_id: i.produce_id, quantity: i.qty, unit_cost: i.cost, batch_id: i.batch_id, spoilage_reason: i.reason || 'expired' }));
      await api.post('/procurement/waste', { ...values, items });
      message.success('Waste recorded');
      setWasteModal(false);
      load();
    } catch (err) { message.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="Pending POs" value={pos.filter(p => p.status === 'placed' || p.status === 'confirmed').length} /></Card></Col>
        <Col span={6}><Card><Statistic title="GRNs Today" value={grns.filter(g => dayjs(g.receipt_date).isSame(dayjs(), 'day')).length} /></Card></Col>
        <Col span={6}><Card><Statistic title="Waste (7d)" value={waste.filter(w => dayjs(w.recorded_date).isAfter(dayjs().subtract(7, 'day'))).reduce((s, w) => s + w.total_value, 0)} prefix="₹" /></Card></Col>
        <Col span={6}><Card><Statistic title="Active Suppliers" value={suppliers.length} /></Card></Col>
      </Row>

      <Tabs items={[
        { key: 'pos', label: 'Purchase Orders', children: <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setPoModal(true)} style={{ marginBottom: 16 }}>New PO</Button>
          <Table dataSource={pos} rowKey="id" loading={loading} size="small" columns={[
            { title: 'PO #', dataIndex: 'po_number' }, { title: 'Supplier', dataIndex: 'supplier_name' },
            { title: 'Store', dataIndex: 'store_name' }, { title: 'Total', dataIndex: 'total_cost', render: v => `₹${v}` },
            { title: 'Status', dataIndex: 'status', render: v => <Tag color={v === 'received' ? 'green' : v === 'placed' ? 'blue' : v === 'cancelled' ? 'red' : 'orange'}>{v}</Tag> },
            { title: 'Date', dataIndex: 'order_date', render: v => dayjs(v).format('DD/MM') },
            { render: (_, r) => r.status === 'placed' ? <Button size="small" onClick={() => api.put(`/procurement/purchase-orders/${r.id}/status`, { status: 'received' }).then(() => load())}>Receive</Button> : null }
          ]} />
        </> },
        { key: 'grns', label: 'Goods Receipts', children: <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setGrnModal(true)} style={{ marginBottom: 16 }}>New GRN</Button>
          <Table dataSource={grns} rowKey="id" loading={loading} size="small" columns={[
            { title: 'GRN #', dataIndex: 'grn_number' }, { title: 'Supplier', dataIndex: 'supplier_name' },
            { title: 'Store', dataIndex: 'store_name' }, { title: 'Status', dataIndex: 'status', render: v => <Tag>{v}</Tag> },
            { title: 'Date', dataIndex: 'receipt_date', render: v => dayjs(v).format('DD/MM') },
          ]} />
        </> },
        { key: 'waste', label: 'Waste & Spoilage', children: <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setWasteModal(true)} style={{ marginBottom: 16 }}>Record Waste</Button>
          <Table dataSource={waste} rowKey="id" loading={loading} size="small" columns={[
            { title: 'Date', dataIndex: 'recorded_date', render: v => dayjs(v).format('DD/MM') },
            { title: 'Store', dataIndex: 'store_name' }, { title: 'Value', dataIndex: 'total_value', render: v => <Tag color="red">₹{v}</Tag> },
            { title: 'Disposal', dataIndex: 'disposal_method', render: v => <Tag>{v}</Tag> },
            { title: 'Items', render: (_, r) => r.items?.length },
          ]} />
        </> },
      ]} />

      {/* PO Modal */}
      <Modal title="New Purchase Order" open={poModal} onCancel={() => setPoModal(false)} footer={null} width={600}>
        <Form layout="vertical" onFinish={createPO}>
          <Form.Item name="store_id" label="Store" rules={[{ required: true }]}><Select options={stores.map(s => ({ value: s.id, label: s.name }))} /></Form.Item>
          <Form.Item name="supplier_id" label="Supplier" rules={[{ required: true }]}><Select options={suppliers.map(s => ({ value: s.id, label: s.name }))} /></Form.Item>
          <Form.List name="items">{(fields, { add, remove }) => (<>
            {fields.map(({ key, name, ...rest }) => (
              <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                <Form.Item {...rest} name={[name, 'produce_id']} rules={[{ required: true }]}><Select options={produce.map(p => ({ value: p.id, label: p.name }))} placeholder="Produce" style={{ width: 150 }} /></Form.Item>
                <Form.Item {...rest} name={[name, 'qty']} rules={[{ required: true }]}><InputNumber placeholder="Qty" min={0.1} /></Form.Item>
                <Form.Item {...rest} name={[name, 'cost']} rules={[{ required: true }]}><InputNumber placeholder="Cost" min={0} prefix="₹" /></Form.Item>
                <Button onClick={() => remove(name)}>X</Button>
              </Space>
            ))}
            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Add Item</Button>
          </>)}</Form.List>
          <Button type="primary" htmlType="submit" block style={{ marginTop: 16 }}>Create PO</Button>
        </Form>
      </Modal>

      {/* GRN Modal */}
      <Modal title="New Goods Receipt" open={grnModal} onCancel={() => setGrnModal(false)} footer={null} width={600}>
        <Form layout="vertical" onFinish={createGRN}>
          <Form.Item name="store_id" label="Store" rules={[{ required: true }]}><Select options={stores.map(s => ({ value: s.id, label: s.name }))} /></Form.Item>
          <Form.Item name="supplier_id" label="Supplier" rules={[{ required: true }]}><Select options={suppliers.map(s => ({ value: s.id, label: s.name }))} /></Form.Item>
          <Form.Item name="po_id" label="Reference PO"><Select allowClear options={pos.filter(p => p.status !== 'received').map(p => ({ value: p.id, label: p.po_number }))} /></Form.Item>
          <Form.List name="items">{(fields, { add, remove }) => (<>
            {fields.map(({ key, name, ...rest }) => (
              <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                <Form.Item {...rest} name={[name, 'produce_id']} rules={[{ required: true }]}><Select options={produce.map(p => ({ value: p.id, label: p.name }))} placeholder="Produce" style={{ width: 120 }} /></Form.Item>
                <Form.Item {...rest} name={[name, 'qty']} rules={[{ required: true }]}><InputNumber placeholder="Qty" min={0.1} /></Form.Item>
                <Form.Item {...rest} name={[name, 'cost']} rules={[{ required: true }]}><InputNumber placeholder="Cost" min={0} prefix="₹" /></Form.Item>
                <Form.Item {...rest} name={[name, 'grade']}><Select placeholder="Grade" options={[{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }]} style={{ width: 80 }} /></Form.Item>
                <Form.Item {...rest} name={[name, 'rejected']}><InputNumber placeholder="Reject" min={0} /></Form.Item>
                <Button onClick={() => remove(name)}>X</Button>
              </Space>
            ))}
            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Add Item</Button>
          </>)}</Form.List>
          <Button type="primary" htmlType="submit" block style={{ marginTop: 16 }}>Record GRN</Button>
        </Form>
      </Modal>

      {/* Waste Modal */}
      <Modal title="Record Waste" open={wasteModal} onCancel={() => setWasteModal(false)} footer={null} width={500}>
        <Form layout="vertical" onFinish={createWaste}>
          <Form.Item name="store_id" label="Store" rules={[{ required: true }]}><Select options={stores.map(s => ({ value: s.id, label: s.name }))} /></Form.Item>
          <Form.Item name="disposal_method" label="Disposal" initialValue="landfill"><Select options={[{ value: 'landfill', label: 'Landfill' }, { value: 'donation', label: 'Donation' }, { value: 'compost', label: 'Compost' }, { value: 'pig_feed', label: 'Pig Feed' }]} /></Form.Item>
          <Form.List name="items">{(fields, { add, remove }) => (<>
            {fields.map(({ key, name, ...rest }) => (
              <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                <Form.Item {...rest} name={[name, 'produce_id']} rules={[{ required: true }]}><Select options={produce.map(p => ({ value: p.id, label: p.name }))} placeholder="Produce" style={{ width: 130 }} /></Form.Item>
                <Form.Item {...rest} name={[name, 'qty']} rules={[{ required: true }]}><InputNumber placeholder="Qty" min={0.01} /></Form.Item>
                <Form.Item {...rest} name={[name, 'reason']}><Select placeholder="Reason" style={{ width: 120 }} options={[{ value: 'expired', label: 'Expired' }, { value: 'over_ordering', label: 'Over Order' }, { value: 'handling', label: 'Handling' }, { value: 'temp_failure', label: 'Temp Failure' }, { value: 'customer_return', label: 'Customer Return' }]} /></Form.Item>
                <Button onClick={() => remove(name)}>X</Button>
              </Space>
            ))}
            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Add Item</Button>
          </>)}</Form.List>
          <Button type="primary" htmlType="submit" block style={{ marginTop: 16 }}>Record Waste</Button>
        </Form>
      </Modal>
    </div>
  );
}
