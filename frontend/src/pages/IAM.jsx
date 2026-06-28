import React, { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Select, InputNumber, Space, message, Tag } from 'antd'
import { PlusOutlined, LockOutlined } from '@ant-design/icons'
import api from '../api'

export default function IAM() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userModal, setUserModal] = useState(false);
  const [roleModal, setRoleModal] = useState(false);
  const [permModal, setPermModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/iam/users'),
      api.get('/iam/roles'),
      api.get('/masterdata/stores'),
    ]).then(([u, r, s]) => {
      setUsers(u.data);
      setRoles(r.data.roles);
      setPermissions(r.data.permissions);
      setStores(s.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (<div>
    <Table dataSource={users} rowKey="id" loading={loading} size="small"
      columns={[
        {title:'Username',dataIndex:'username'},{title:'Full Name',dataIndex:'full_name'},{title:'Email',dataIndex:'email'},
        {title:'Role',dataIndex:'role_name',render:v=><Tag>{v}</Tag>},{title:'Store',dataIndex:'store_name'},
        {title:'Status',dataIndex:'is_active',render:v=><Tag color={v?'green':'red'}>{v?'Active':'Inactive'}</Tag>},
        {title:'Last Login',dataIndex:'last_login',render:v=>v?.slice(0,10)||'-'},
        {render:(_,r)=><Button size="small" onClick={()=>{setSelectedRole(r);setUserModal(true)}}>Edit</Button>}
      ]}
    />
    <Space style={{marginTop:16}}>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setUserModal(true)}>Add User</Button>
      <Button onClick={() => setRoleModal(true)}>Add Role</Button>
      <Button onClick={() => setPermModal(true)}>Manage Permissions</Button>
    </Space>

    <Modal title={selectedRole ? 'Edit User' : 'Add User'} open={userModal} onCancel={() => {setUserModal(false);setSelectedRole(null)}} footer={null} width={500}>
      <Form layout="vertical" initialValues={selectedRole||{}} onFinish={(values) => {
        const fn = selectedRole ? api.put(`/iam/users/${selectedRole.id}`, values) : api.post('/iam/users', values);
        fn.then(()=>{message.success('Saved');setUserModal(false);setSelectedRole(null);load();}).catch(e=>message.error(e.response?.data?.error));
      }}>
        <Form.Item name="username" label="Username" rules={[{required:true}]}><Input /></Form.Item>
        {!selectedRole && <Form.Item name="password" label="Password" rules={[{required:true}]}><Input.Password prefix={<LockOutlined />} /></Form.Item>}
        <Form.Item name="full_name" label="Full Name" rules={[{required:true}]}><Input /></Form.Item>
        <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
        <Form.Item name="phone" label="Phone"><Input /></Form.Item>
        <Form.Item name="role_id" label="Role" rules={[{required:true}]}><Select options={roles.map(r=>({value:r.id,label:r.name}))} /></Form.Item>
        <Form.Item name="store_id" label="Store"><Select allowClear options={stores.map(s=>({value:s.id,label:s.name}))} /></Form.Item>
        <Button type="primary" htmlType="submit" block>Save</Button>
      </Form>
    </Modal>

    <Modal title="Add Role" open={roleModal} onCancel={() => setRoleModal(false)} footer={null}>
      <Form layout="vertical" onFinish={(v) => api.post('/iam/roles', v).then(()=>{message.success('Created');setRoleModal(false);load();})}>
        <Form.Item name="name" label="Role Name" rules={[{required:true}]}><Input /></Form.Item>
        <Form.Item name="description" label="Description"><Input /></Form.Item>
        <Button type="primary" htmlType="submit" block>Create</Button>
      </Form>
    </Modal>

    <Modal title="Manage Permissions" open={permModal} onCancel={() => setPermModal(false)} footer={null} width={600}>
      <Form layout="vertical" onFinish={async (values) => {
        const perms = modules.map(m => ({
          module: m, can_read: values[`${m}_read`]||0, can_create: values[`${m}_create`]||0,
          can_update: values[`${m}_update`]||0, can_delete: values[`${m}_delete`]||0, can_approve: values[`${m}_approve`]||0
        }));
        await api.put(`/iam/permissions/${values.role_id}`, { permissions: perms });
        message.success('Permissions updated'); setPermModal(false); load();
      }}>
        <Form.Item name="role_id" label="Role" rules={[{required:true}]}>
          <Select options={roles.map(r=>({value:r.id,label:r.name}))} />
        </Form.Item>
      </Form>
    </Modal>
  </div>);
}

const modules = ['dashboard','masterdata','inventory','sales','procurement','finance','expenses','customers','suppliers','vehicles','reports','analytics','notifications','settings','audit','iam'];
