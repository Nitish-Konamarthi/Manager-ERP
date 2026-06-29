import React, { useState, useEffect } from 'react'
import { Tabs, Table, Button, Select, DatePicker, Space, Card, Row, Col, Statistic, Tag } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import api from '../api'

export default function Reports() {
  const [salesData, setSalesData] = useState([]);
  const [purchasesData, setPurchasesData] = useState([]);
  const [wasteData, setWasteData] = useState([]);
  const [invData, setInvData] = useState([]);
  const [plData, setPlData] = useState([]);
  const [hotelData, setHotelData] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = (type) => {
    setLoading(true);
    const p = { from: dayjs().subtract(30, 'day').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') };
    const calls = [];
    if (!type || type === 'sales') calls.push(api.get('/reports/sales', { params: p }).then(r => setSalesData(Array.isArray(r?.data) ? r.data : [])));
    if (!type || type === 'purchases') calls.push(api.get('/reports/purchases', { params: p }).then(r => setPurchasesData(Array.isArray(r?.data) ? r.data : [])));
    if (!type || type === 'waste') calls.push(api.get('/reports/waste', { params: p }).then(r => setWasteData(Array.isArray(r?.data) ? r.data : [])));
    if (!type || type === 'inventory') calls.push(api.get('/reports/inventory').then(r => setInvData(Array.isArray(r?.data) ? r.data : [])));
    if (!type || type === 'pl') calls.push(api.get('/reports/pl', { params: p }).then(r => setPlData(Array.isArray(r?.data) ? r.data : [])));
    if (!type || type === 'hotel') calls.push(api.get('/reports/hotel-sales', { params: p }).then(r => setHotelData(Array.isArray(r?.data) ? r.data : [])));
    Promise.all(calls).finally(() => setLoading(false));
  };

  useEffect(() => { load(); api.get('/masterdata/stores').then(r => setStores(r.data)); }, []);

  const chartOpt = (data, name) => ({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: data.map(d => d.period), axisLabel: { rotate: 45 } },
    yAxis: { type: 'value' },
    series: [{ data: data.map(d => d.revenue || d.total_cost || d.total_amount || d.waste_value || 0), type: 'bar', name }]
  });

  const totalSales = salesData.reduce((s,d) => s + (d.revenue||0), 0);
  const totalPurchases = purchasesData.reduce((s,d) => s + (d.total_cost||0), 0);

  return (<div>
    <Row gutter={[16,16]} style={{marginBottom:16}}>
      <Col span={6}><Card><Statistic title="Sales (30d)" value={totalSales} prefix="₹" /></Card></Col>
      <Col span={6}><Card><Statistic title="Purchases (30d)" value={totalPurchases} prefix="₹" /></Card></Col>
      <Col span={6}><Card><Statistic title="Waste Value" value={wasteData.reduce((s,d) => s + (d.total_value||0), 0)} prefix="₹" /></Card></Col>
      <Col span={6}><Card><Statistic title="Stock Value" value={invData.reduce((s,d) => s + d.stock_value, 0)} prefix="₹" /></Card></Col>
    </Row>

    <Tabs items={[
      { key: 'sales', label: 'Sales Report', children: <>
        <ReactECharts option={chartOpt(salesData, 'Sales')} style={{height:300}} />
        <Table dataSource={salesData} rowKey="period" size="small" columns={[
          {title:'Period',dataIndex:'period'},{title:'Transactions',dataIndex:'transactions'},{title:'Revenue',dataIndex:'revenue',render:v=>`₹${v}`},
          {title:'Cash',dataIndex:'cash',render:v=>`₹${v}`},{title:'UPI',dataIndex:'upi',render:v=>`₹${v}`},{title:'Card',dataIndex:'card',render:v=>`₹${v}`}
        ]} />
      </> },
      { key: 'purchases', label: 'Purchases Report', children: <>
        <ReactECharts option={chartOpt(purchasesData, 'Purchases')} style={{height:300}} />
        <Table dataSource={purchasesData} rowKey="period" size="small" columns={[
          {title:'Period',dataIndex:'period'},{title:'Orders',dataIndex:'orders'},{title:'Total Cost',dataIndex:'total_cost',render:v=>`₹${v}`}
        ]} />
      </> },
      { key: 'waste', label: 'Waste Analysis', children: <>
        <ReactECharts option={{
          tooltip:{trigger:'item'}, series:[{
            data: wasteData.map(d => ({name: d.spoilage_reason||d.period, value: d.total_value||d.waste_value})),
            type: 'pie', radius: ['40%','70%']
          }]
        }} style={{height:300}} />
        <Table dataSource={wasteData} rowKey={r => r.spoilage_reason||r.period} size="small" columns={[
          {title:'Reason/Period',dataIndex:'spoilage_reason',render:(v,r)=>v||r.period},{title:'Incidents',dataIndex:'incidents'},{title:'Qty',dataIndex:'total_qty',render:v=>v?`${v} kg`:'-'},{title:'Value',dataIndex:'total_value',render:v=>v?`₹${v}`:''}
        ]} />
      </> },
      { key: 'inventory', label: 'Inventory Report', children: <>
        <Table dataSource={invData} rowKey={r => r.produce_id + r.store_id} size="small" columns={[
          {title:'Produce',dataIndex:'produce_name'},{title:'Store',dataIndex:'store_name'},{title:'Category',dataIndex:'category'},
          {title:'Qty',dataIndex:'total_qty',render:v=>Math.round(v)},{title:'Avg Cost',dataIndex:'avg_cost',render:v=>`₹${v.toFixed(2)}`},
          {title:'Stock Value',dataIndex:'stock_value',render:v=>`₹${Math.round(v)}`},{title:'Batches',dataIndex:'batches'},
          {title:'Expiring',dataIndex:'expiring_qty',render:v=>v>0?<Tag color="orange">{v}</Tag>:'-'}
        ]} />
      </> },
      { key: 'pl', label: 'P&L Report', children: <>
        <ReactECharts option={{
          tooltip:{trigger:'axis'}, legend:{data:['Revenue','COGS','Net Profit']},
          xAxis:{type:'category',data:plData.map(d=>d.period),axisLabel:{rotate:45}},
          yAxis:{type:'value'},
          series:[
            {data:plData.map(d=>d.revenue),type:'bar',name:'Revenue',color:'#52c41a'},
            {data:plData.map(d=>d.cogs),type:'bar',name:'COGS',color:'#faad14'},
            {data:plData.map(d=>d.net_profit),type:'line',name:'Net Profit',color:'#1890ff'},
          ]
        }} style={{height:300}} />
        <Table dataSource={plData} rowKey="period" size="small" columns={[
          {title:'Period',dataIndex:'period'},{title:'Revenue',dataIndex:'revenue',render:v=>`₹${v}`},{title:'COGS',dataIndex:'cogs',render:v=>`₹${v}`},
          {title:'Expenses',dataIndex:'expenses',render:v=>`₹${v}`},{title:'Waste',dataIndex:'waste',render:v=>`₹${v}`},
          {title:'Gross Profit',dataIndex:'gross_profit',render:v=>`₹${v}`},{title:'Net Profit',dataIndex:'net_profit',render:v=><strong>₹${v}</strong>},
          {title:'Margin %',dataIndex:'margin_pct',render:v=><Tag color={v>30?'green':v>20?'orange':'red'}>{v}%</Tag>}
        ]} />
      </> },
      { key: 'hotel', label: 'Hotel Sales', children: <>
        <Table dataSource={hotelData} rowKey="customer_id" size="small" columns={[
          {title:'Hotel',dataIndex:'customer_name'},{title:'Orders',dataIndex:'orders'},{title:'Total',dataIndex:'total_amount',render:v=>`₹${v}`},
          {title:'Avg Order',dataIndex:'avg_order_value',render:v=>`₹${Math.round(v)}`},
          {title:'Completed',dataIndex:'completed',render:v=><Tag color="green">{v}</Tag>},
          {title:'Pending',dataIndex:'pending',render:v=><Tag color="orange">{v}</Tag>}
        ]} />
      </> },
    ]} />
  </div>);
}
