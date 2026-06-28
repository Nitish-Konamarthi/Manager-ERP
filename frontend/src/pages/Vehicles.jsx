import React, { useState, useEffect } from 'react'
import { Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, Space, message, Tag, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [vehExpenses, setVehExpenses] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [vehModal, setVehModal] = useState(false);
  const [tripModal, setTripModal] = useState(false);
  const [expModal, setExpModal] = useState(false);
  const [maintModal, setMaintModal] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/vehicles'),
      api.get('/vehicles/trips'),
      api.get('/vehicles/expenses'),
      api.get('/vehicles/maintenance'),
    ]).then(([v, t, e, m]) => { setVehicles(v.data); setTrips(t.data); setVehExpenses(e.data); setMaintenance(m.data); }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalFuel = vehExpenses.filter(e => e.expense_type === 'fuel').reduce((s, e) => s + e.amount, 0);

  return (<div>
    <Row gutter={[16,16]} style={{marginBottom:16}}>
      <Col span={6}><Card><Statistic title="Vehicles" value={vehicles.length} /></Card></Col>
      <Col span={6}><Card><Statistic title="Active" value={vehicles.filter(v => v.status === 'active').length} /></Card></Col>
      <Col span={6}><Card><Statistic title="Fuel (30d)" value={totalFuel} prefix="₹" /></Card></Col>
      <Col span={6}><Card><Statistic title="Trips (30d)" value={trips.filter(t => dayjs(t.trip_date).isAfter(dayjs().subtract(30,'day'))).length} /></Card></Col>
    </Row>

    <Tabs items={[
      { key: 'vehicles', label: 'Vehicles', children: <>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setVehModal(true)} style={{marginBottom:16}}>Add Vehicle</Button>
        <Table dataSource={vehicles} columns={[
          {title:'Reg #',dataIndex:'registration_no'},{title:'Type',dataIndex:'vehicle_type',render:v=><Tag>{v}</Tag>},
          {title:'Capacity',dataIndex:'capacity_kg',render:v=>`${v} kg`},{title:'Temp Control',dataIndex:'has_temperature_control',render:v=>v ? 'Yes' : 'No'},
          {title:'Insurance',dataIndex:'insurance_expiry',render:v=>v ? dayjs(v).format('DD/MM/YY') : '-'},
          {title:'Status',dataIndex:'status',render:v=><Tag color={v==='active'?'green':v==='maintenance'?'orange':'red'}>{v}</Tag>},
        ]} rowKey="id" loading={loading} size="small" />
      </> },
      { key: 'trips', label: 'Trips', children: <>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setTripModal(true)} style={{marginBottom:16}}>New Trip</Button>
        <Table dataSource={trips} columns={[
          {title:'Trip #',dataIndex:'trip_number'},{title:'Vehicle',dataIndex:'registration_no'},
          {title:'Driver',dataIndex:'driver_name'},{title:'KM',dataIndex:'total_km',render:v=>v ? `${v} km` : '-'},
          {title:'Route',dataIndex:'route_description'},{title:'Date',dataIndex:'trip_date',render:v=>dayjs(v).format('DD/MM')},
          {title:'Status',dataIndex:'status',render:v=><Tag>{v}</Tag>}
        ]} rowKey="id" loading={loading} size="small" />
      </> },
      { key: 'expenses', label: 'Vehicle Expenses', children: <>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setExpModal(true)} style={{marginBottom:16}}>Add Expense</Button>
        <Table dataSource={vehExpenses} columns={[
          {title:'Vehicle',dataIndex:'registration_no'},{title:'Type',dataIndex:'expense_type',render:v=><Tag>{v}</Tag>},
          {title:'Amount',dataIndex:'amount',render:v=>`₹${v}`},{title:'Qty',dataIndex:'quantity',render:v=>v ? `${v} L` : '-'},
          {title:'Vendor',dataIndex:'vendor_name'},{title:'Bill #',dataIndex:'bill_number'},
          {title:'Date',dataIndex:'expense_date',render:v=>dayjs(v).format('DD/MM')}
        ]} rowKey="id" loading={loading} size="small" />
      </> },
      { key: 'maintenance', label: 'Maintenance', children: <>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setMaintModal(true)} style={{marginBottom:16}}>Add Record</Button>
        <Table dataSource={maintenance} columns={[
          {title:'Vehicle',dataIndex:'registration_no'},{title:'Type',dataIndex:'maintenance_type',render:v=><Tag>{v}</Tag>},
          {title:'Description',dataIndex:'description'},{title:'Amount',dataIndex:'amount',render:v=>`₹${v}`},
          {title:'Vendor',dataIndex:'vendor_name'},{title:'Next Service',render:(_,r)=>r.next_service_km ? `${r.next_service_km} km` : r.next_service_date||'-'},
          {title:'Date',dataIndex:'service_date',render:v=>dayjs(v).format('DD/MM')}
        ]} rowKey="id" loading={loading} size="small" />
      </> },
    ]} />

    <Modal title="Add Vehicle" open={vehModal} onCancel={() => setVehModal(false)} footer={null} width={500}>
      <Form layout="vertical" onFinish={(v) => api.post('/vehicles', v).then(()=>{message.success('Created');setVehModal(false);load();})}>
        <Form.Item name="registration_no" label="Registration #" rules={[{required:true}]}><Input /></Form.Item>
        <Form.Item name="vehicle_type" label="Type"><Select options={[{value:'delivery_van',label:'Delivery Van'},{value:'pickup',label:'Pickup'},{value:'motorcycle',label:'Motorcycle'},{value:'auto',label:'Auto'}]} /></Form.Item>
        <Form.Item name="capacity_kg" label="Capacity (kg)"><InputNumber min={0} /></Form.Item>
        <Form.Item name="has_temperature_control" label="Temp Controlled?"><Select options={[{value:0,label:'No'},{value:1,label:'Yes'}]} /></Form.Item>
        <Form.Item name="insurance_expiry" label="Insurance Expiry"><Input placeholder="YYYY-MM-DD" /></Form.Item>
        <Button type="primary" htmlType="submit" block>Save</Button>
      </Form>
    </Modal>

    <Modal title="New Trip" open={tripModal} onCancel={() => setTripModal(false)} footer={null}>
      <Form layout="vertical" onFinish={(v) => api.post('/vehicles/trips', v).then(()=>{message.success('Created');setTripModal(false);load();})}>
        <Form.Item name="vehicle_id" label="Vehicle" rules={[{required:true}]}><Select options={vehicles.map(v=>({value:v.id,label:v.registration_no}))} /></Form.Item>
        <Form.Item name="route_description" label="Route"><Input.TextArea /></Form.Item>
        <Form.Item name="start_odometer" label="Start Odometer"><InputNumber min={0} /></Form.Item>
        <Form.Item name="trip_date" label="Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
        <Button type="primary" htmlType="submit" block>Create</Button>
      </Form>
    </Modal>

    <Modal title="Add Vehicle Expense" open={expModal} onCancel={() => setExpModal(false)} footer={null} width={500}>
      <Form layout="vertical" onFinish={(v) => api.post('/vehicles/expenses', v).then(()=>{message.success('Saved');setExpModal(false);load();})}>
        <Form.Item name="vehicle_id" label="Vehicle" rules={[{required:true}]}><Select options={vehicles.map(v=>({value:v.id,label:v.registration_no}))} /></Form.Item>
        <Form.Item name="expense_type" label="Type" rules={[{required:true}]}><Select options={[{value:'fuel',label:'Fuel'},{value:'toll',label:'Toll'},{value:'parking',label:'Parking'},{value:'cleaning',label:'Cleaning'},{value:'repair',label:'Repair'}]} /></Form.Item>
        <Form.Item name="amount" label="Amount" rules={[{required:true}]}><InputNumber min={1} prefix="₹" style={{width:'100%'}} /></Form.Item>
        <Form.Item name="quantity" label="Quantity (Liters)"><InputNumber min={0} /></Form.Item>
        <Form.Item name="vendor_name" label="Vendor"><Input /></Form.Item>
        <Form.Item name="bill_number" label="Bill #"><Input /></Form.Item>
        <Button type="primary" htmlType="submit" block>Save</Button>
      </Form>
    </Modal>

    <Modal title="Add Maintenance" open={maintModal} onCancel={() => setMaintModal(false)} footer={null} width={500}>
      <Form layout="vertical" onFinish={(v) => api.post('/vehicles/maintenance', v).then(()=>{message.success('Saved');setMaintModal(false);load();})}>
        <Form.Item name="vehicle_id" label="Vehicle" rules={[{required:true}]}><Select options={vehicles.map(v=>({value:v.id,label:v.registration_no}))} /></Form.Item>
        <Form.Item name="maintenance_type" label="Type"><Select options={[{value:'scheduled',label:'Scheduled'},{value:'repair',label:'Repair'},{value:'emergency',label:'Emergency'}]} /></Form.Item>
        <Form.Item name="description" label="Description" rules={[{required:true}]}><Input /></Form.Item>
        <Form.Item name="amount" label="Amount" rules={[{required:true}]}><InputNumber min={1} prefix="₹" style={{width:'100%'}} /></Form.Item>
        <Form.Item name="vendor_name" label="Vendor"><Input /></Form.Item>
        <Form.Item name="next_service_km" label="Next Service (km)"><InputNumber min={0} /></Form.Item>
        <Button type="primary" htmlType="submit" block>Save</Button>
      </Form>
    </Modal>
  </div>);
}
