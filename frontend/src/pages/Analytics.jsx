import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Table, DatePicker, Select, Typography, Spin } from 'antd'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import api from '../api'

export default function Analytics() {
  const [topProducts, setTopProducts] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [paymentSplit, setPaymentSplit] = useState([]);
  const [wasteTrend, setWasteTrend] = useState([]);
  const [catPerformance, setCatPerformance] = useState([]);
  const [storeComp, setStoreComp] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/top-products?limit=10'),
      api.get('/analytics/peak-hours'),
      api.get('/analytics/payment-split'),
      api.get('/analytics/waste-trend'),
      api.get('/analytics/category-performance'),
      api.get('/analytics/store-comparison'),
      api.get('/analytics/forecast'),
    ]).then(([tp, ph, ps, wt, cp, sc, f]) => {
      setTopProducts(tp.data);
      setPeakHours(ph.data);
      setPaymentSplit(ps.data);
      setWasteTrend(wt.data);
      setCatPerformance(cp.data);
      setStoreComp(sc.data);
      setForecast(f.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{display:'block',margin:'100px auto'}} />;

  return (<div>
    <Typography.Title level={4}>Analytics</Typography.Title>

    {forecast && <Row gutter={[16,16]} style={{marginBottom:16}}>
      <Col span={6}><Card><Typography.Text>Avg Daily Revenue</Typography.Text><br/><Typography.Title level={3}>₹{forecast.avg_daily}</Typography.Title></Card></Col>
      <Col span={6}><Card><Typography.Text>Forecast Tomorrow</Typography.Text><br/><Typography.Title level={3}>₹{forecast.forecast_tomorrow}</Typography.Title></Card></Col>
      <Col span={6}><Card><Typography.Text>Trend (7d)</Typography.Text><br/><Typography.Title level={3} style={{color: forecast.trend >= 0 ? '#52c41a' : '#ff4d4f'}}>{forecast.trend >= 0 ? '+' : ''}{forecast.trend.toFixed(0)}</Typography.Title></Card></Col>
    </Row>}

    <Row gutter={[16,16]}>
      <Col xs={24} md={12}>
        <Card title="Top Products by Revenue" size="small">
          <ReactECharts option={{
            tooltip:{trigger:'axis'}, xAxis:{type:'category',data:topProducts.map(p=>p.name),axisLabel:{rotate:45}},
            yAxis:{type:'value'}, series:[{data:topProducts.map(p=>p.total_revenue),type:'bar',color:'#52c41a'}]
          }} style={{height:300}} />
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="Peak Hours (7 days)" size="small">
          <ReactECharts option={{
            tooltip:{trigger:'axis'}, xAxis:{type:'category',data:peakHours.map(h=>`${h.hour}:00`)},
            yAxis:{type:'value'}, series:[{data:peakHours.map(h=>h.transactions),type:'line',smooth:true,color:'#1890ff',areaStyle:{color:'rgba(24,144,255,0.1)'}}]
          }} style={{height:300}} />
        </Card>
      </Col>
    </Row>

    <Row gutter={[16,16]} style={{marginTop:16}}>
      <Col xs={24} md={8}>
        <Card title="Payment Split" size="small">
          <ReactECharts option={{
            series:[{data:paymentSplit.map(p=>({name:p.payment_method,value:p.total})),type:'pie',radius:['40%','70%']}]
          }} style={{height:250}} />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card title="Category Performance" size="small">
          <Table dataSource={catPerformance} rowKey="id" size="small" pagination={false}
            columns={[
              {title:'Category',dataIndex:'name'},{title:'Revenue',dataIndex:'revenue',render:v=>`₹${Math.round(v)}`},
              {title:'Qty',dataIndex:'total_qty',render:v=>`${Math.round(v)} kg`}
            ]} />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card title="Store Comparison" size="small">
          <Table dataSource={storeComp} rowKey="id" size="small" pagination={false}
            columns={[
              {title:'Store',dataIndex:'name'},{title:'Revenue',dataIndex:'revenue',render:v=>`₹${v}`},
              {title:'Waste',dataIndex:'waste',render:v=>`₹${v}`},{title:'Net',dataIndex:'net_profit',render:v=><strong>₹${v}</strong>}
            ]} />
        </Card>
      </Col>
    </Row>

    <Card title="Waste Trend (30 days)" size="small" style={{marginTop:16}}>
      <ReactECharts option={{
        tooltip:{trigger:'axis'}, xAxis:{type:'category',data:wasteTrend.map(w=>w.date?.slice(5)),axisLabel:{rotate:45,interval:5}},
        yAxis:{type:'value'}, series:[{data:wasteTrend.map(w=>w.waste_value),type:'line',smooth:true,color:'#ff4d4f',areaStyle:{color:'rgba(255,77,79,0.1)'}}]
      }} style={{height:250}} />
    </Card>
  </div>);
}
