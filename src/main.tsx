import '@arco-design/web-react/es/_util/react-19-adapter';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from '@arco-design/web-react';
import zhCN from '@arco-design/web-react/es/locale/zh-CN';
import '@arco-themes/react-spring/css/arco.css';
import './styles.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={zhCN}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ConfigProvider>,
);
