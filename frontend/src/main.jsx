import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ConfigProvider theme={{ token: { colorPrimary: '#52c41a', borderRadius: 6 } }}>
      <App />
    </ConfigProvider>
  </BrowserRouter>
)
