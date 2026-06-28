import React, { useState, useEffect } from 'react'
import { Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, Space, message, Popconfirm, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../api'

export default function MasterData() {
  const [produce, setProduce] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [modal, setModal] = useState({ open: false, data: null, type: 'produce' });
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/masterdata/produce'),
      api.get('/masterdata/categories'),
      api.get('/masterdata/stores')
    ]).then(([p, c, s]) => {
      setProduce(p.data);
      setCategories(c.data);
      setStores(s.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (values) => {
    try {
      if (modal.type === 'produce') {
        if (modal.data) await api.put(`/masterdata/produce/${modal.data.id}`, values);
        else await api.post('/masterdata/produce', values);
      } else if (modal.type === 'category') {
        if (modal.data) await api.put(`/masterdata/categories/${modal.data.id}`, values);
        else await api.post('/masterdata/categories', values);
      } else if (modal.type === 'store') {
        if (modal.data) await api.put(`/masterdata/stores/${modal.data.id}`, values);
        else await api.post('/masterdata/stores', values);
      }
      message.success('Saved');
      setModal({ open: false });
      load();
    } catch (err) { message.error(err.response?.data?.error || 'Error saving'); }
  };

  const produceColumns = [
    { title: 'Code', dataIndex: 'code' }, { title: 'Name', dataIndex: 'name' },
    { title: 'Category', dataIndex: 'category_name' },
    { title: 'UOM', dataIndex: 'default_uom' }, { title: 'HSN', dataIndex: 'hsn_code' },
    { title: 'Margin %', dataIndex: 'min_margin_pct', render: v => `${v}%` },
    { title: 'Actions', render: (_, r) => <Button type="link" icon={<EditOutlined />} onClick={() => setModal({ open: true, data: r, type: 'produce' })} /> }
  ];

  const catColumns = [
    { title: 'Name', dataIndex: 'name' }, { title: 'Shelf Life', dataIndex: 'shelf_life_days', render: v => `${v} days` },
    { title: 'Target Waste', dataIndex: 'target_waste_pct', render: v => `${v}%` },
    { title: 'Min Margin', dataIndex: 'min_margin_pct', render: v => `${v}%` },
    { title: 'Temp Range', render: (_, r) => r.storage_temp_min && r.storage_temp_max ? `${r.storage_temp_min}-${r.storage_temp_max}°C` : '-' },
    { title: 'Actions', render: (_, r) => <Button type="link" icon={<EditOutlined />} onClick={() => setModal({ open: true, data: r, type: 'category' })} /> }
  ];

  const storeColumns = [
    { title: 'Code', dataIndex: 'code' }, { title: 'Name', dataIndex: 'name' },
    { title: 'City', dataIndex: 'city' }, { title: 'Phone', dataIndex: 'phone' },
    { title: 'Hours', render: (_, r) => `${r.opening_time} - ${r.closing_time}` },
    { title: 'Actions', render: (_, r) => <Button type="link" icon={<EditOutlined />} onClick={() => setModal({ open: true, data: r, type: 'store' })} /> }
  ];

  const renderForm = () => {
    const data = modal.data;
    if (modal.type === 'produce') return (
      <Form layout="vertical" initialValues={data || { default_uom: 'kg' }} onFinish={handleSave}>
        <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="category_id" label="Category" rules={[{ required: true }]}><Select options={categories.map(c => ({ value: c.id, label: c.name }))} /></Form.Item>
        <Form.Item name="default_uom" label="Default UOM"><Select options={[{ value: 'kg', label: 'kg' }, { value: 'piece', label: 'piece' }, { value: 'bunch', label: 'bunch' }, { value: 'dozen', label: 'dozen' }]} /></Form.Item>
        <Form.Item name="alternate_uom" label="Alternate UOM"><Input /></Form.Item>
        <Form.Item name="uom_conversion" label="UOM Conversion"><InputNumber step={0.01} /></Form.Item>
        <Form.Item name="hsn_code" label="HSN Code"><Input /></Form.Item>
        <Form.Item name="is_seasonal" label="Seasonal?"><Select options={[{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }]} /></Form.Item>
      </Form>
    );
    if (modal.type === 'category') return (
      <Form layout="vertical" initialValues={data || { target_waste_pct: 5, min_margin_pct: 20, shelf_life_days: 5 }} onFinish={handleSave}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="description" label="Description"><Input.TextArea /></Form.Item>
        <Form.Item name="shelf_life_days" label="Shelf Life (days)"><InputNumber min={1} /></Form.Item>
        <Form.Item name="target_waste_pct" label="Target Waste %"><InputNumber min={0} max={100} /></Form.Item>
        <Form.Item name="min_margin_pct" label="Minimum Margin %"><InputNumber min={0} max={100} /></Form.Item>
        <Form.Item name="storage_temp_min" label="Min Temp (°C)"><InputNumber /></Form.Item>
        <Form.Item name="storage_temp_max" label="Max Temp (°C)"><InputNumber /></Form.Item>
      </Form>
    );
    if (modal.type === 'store') return (
      <Form layout="vertical" initialValues={data || { opening_time: '07:00', closing_time: '20:00' }} onFinish={handleSave}>
        <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="address" label="Address"><Input.TextArea /></Form.Item>
        <Form.Item name="city" label="City"><Input /></Form.Item>
        <Form.Item name="state" label="State"><Input /></Form.Item>
        <Form.Item name="phone" label="Phone"><Input /></Form.Item>
        <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
        <Form.Item name="gstin" label="GSTIN"><Input /></Form.Item>
        <Form.Item name="opening_time" label="Opening Time"><Input /></Form.Item>
        <Form.Item name="closing_time" label="Closing Time"><Input /></Form.Item>
      </Form>
    );
  };

  return (
    <div>
      <Tabs items={[
        { key: 'produce', label: 'Produce', children: <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, data: null, type: 'produce' })} style={{ marginBottom: 16 }}>Add Produce</Button>
          <Table dataSource={produce} columns={produceColumns} rowKey="id" loading={loading} size="small" />
        </> },
        { key: 'categories', label: 'Categories', children: <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, data: null, type: 'category' })} style={{ marginBottom: 16 }}>Add Category</Button>
          <Table dataSource={categories} columns={catColumns} rowKey="id" loading={loading} size="small" />
        </> },
        { key: 'stores', label: 'Stores', children: <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, data: null, type: 'store' })} style={{ marginBottom: 16 }}>Add Store</Button>
          <Table dataSource={stores} columns={storeColumns} rowKey="id" loading={loading} size="small" />
        </> },
      ]} />

      <Modal title={`${modal.data ? 'Edit' : 'Add'} ${modal.type}`} open={modal.open} onCancel={() => setModal({ open: false })} footer={null} width={500}>
        {renderForm()}
        <Button type="primary" htmlType="submit" form={Object.keys(modal).length ? 'form-master' : ''} onClick={() => document.querySelector('form')?.requestSubmit()} block style={{ marginTop: 16 }}>Save</Button>
      </Modal>
    </div>
  );
}
