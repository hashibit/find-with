import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Archive } from './routes/Archive';
import '../sidepanel/quinn.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/archive" element={<Archive />} />
        <Route path="/" element={<Archive />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
);