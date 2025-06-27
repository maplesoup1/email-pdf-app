import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE = 'http://localhost:3000/api';

function App() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [systemStats, setSystemStats] = useState({});
  const [authStatus, setAuthStatus] = useState('checking');
  const [loading, setLoading] = useState({});
  const [messages, setMessages] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [convertMode, setConvertMode] = useState('merged');
  const [attachmentTypes, setAttachmentTypes] = useState([]);
  const [showModeSelector, setShowModeSelector] = useState(false);

  // 工具函数
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const showMessage = (message, type = 'info') => {
    const id = Date.now();
    setMessages(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setMessages(prev => prev.filter(msg => msg.id !== id));
    }, 5000);
  };

  const setLoadingState = (key, state) => {
    setLoading(prev => ({ ...prev, [key]: state }));
  };

  // API调用
  const apiCall = async (endpoint, options = {}) => {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || '请求失败');
      }
      
      return data.data;
    } catch (error) {
      console.error('API调用失败:', error);
      showMessage(`错误: ${error.message}`, 'error');
      throw error;
    }
  };

  // 初始化
  useEffect(() => {
    checkSystemStatus();
    checkAuth();
  }, []);

  const checkSystemStatus = async () => {
    try {
      const [health, downloadsData] = await Promise.all([
        apiCall('/status/health'),
        apiCall('/status/downloads')
      ]);
      
      setSystemStats({
        uptime: Math.floor(health.uptime / 3600),
        totalFiles: downloadsData.totalFiles,
        totalSize: downloadsData.totalSize,
        convertedEmails: downloadsData.convertedEmailsCount,
        attachmentFiles: downloadsData.attachmentFilesCount
      });
    } catch (error) {
      console.error('获取系统状态失败:', error);
    }
  };

  const checkAuth = async () => {
    setLoadingState('auth', true);
    try {
      const authData = await apiCall('/status/auth');
      setAuthStatus(authData.authStatus);
      
      if (authData.authStatus !== 'authenticated') {
        showMessage(authData.errorMessage || '认证未完成', 'error');
      }
    } catch (error) {
      setAuthStatus('error');
    } finally {
      setLoadingState('auth', false);
    }
  };

  const loadEmails = async () => {
    setLoadingState('emails', true);
    try {
      const emailData = await apiCall('/emails/list?maxResults=20');
      setEmails(emailData.emails);
      showMessage(`成功加载 ${emailData.emails.length} 封邮件`, 'success');
    } catch (error) {
      setEmails([]);
    } finally {
      setLoadingState('emails', false);
    }
  };

  const selectEmail = (email) => {
    setSelectedEmail(email);
    setAttachments([]);
  };

  const convertLatestEmail = async () => {
    setLoadingState('convert', true);
    try {
      const result = await apiCall('/emails/convert-latest', { 
        method: 'POST',
        body: JSON.stringify({ 
          mode: convertMode,
          attachmentTypes: attachmentTypes
        })
      });
      
      showMessage(`转换成功! 模式: ${getModeText(result.mode)}`, 'success');
      
      // 下载生成的文件
      result.files.forEach(file => {
        if (file.type === 'email_pdf' || file.type === 'merged_pdf') {
          window.open(`${API_BASE}/emails/download/${file.filename}`);
        } else if (file.type === 'attachment') {
          window.open(`${API_BASE}/attachments/download/${file.filename}`);
        }
      });
      
      await checkSystemStatus();
    } catch (error) {
      // Error already shown by apiCall
    } finally {
      setLoadingState('convert', false);
    }
  };

  const convertSelectedEmail = async () => {
    if (!selectedEmail) {
      showMessage('请先选择一封邮件', 'error');
      return;
    }
    
    setLoadingState('convertSelected', true);
    try {
      const result = await apiCall(`/emails/convert/${selectedEmail.messageId}`, { 
        method: 'POST',
        body: JSON.stringify({ 
          mode: convertMode,
          attachmentTypes: attachmentTypes
        })
      });
      
      showMessage(`转换成功! 模式: ${getModeText(result.mode)}`, 'success');
      
      // 下载生成的文件
      result.files.forEach(file => {
        if (file.type === 'email_pdf' || file.type === 'merged_pdf') {
          window.open(`${API_BASE}/emails/download/${file.filename}`);
        } else if (file.type === 'attachment') {
          window.open(`${API_BASE}/attachments/download/${file.filename}`);
        }
      });
      
      await checkSystemStatus();
    } catch (error) {
      // Error already shown by apiCall
    } finally {
      setLoadingState('convertSelected', false);
    }
  };

  const viewAttachments = async () => {
    if (!selectedEmail) {
      showMessage('请先选择一封邮件', 'error');
      return;
    }
    
    setLoadingState('attachments', true);
    try {
      const attachmentData = await apiCall(`/attachments/${selectedEmail.messageId}/list`);
      setAttachments(attachmentData.attachments);
      
      if (attachmentData.attachments.length === 0) {
        showMessage('此邮件没有附件', 'info');
      }
    } catch (error) {
      setAttachments([]);
    } finally {
      setLoadingState('attachments', false);
    }
  };

  const downloadAttachment = async (attachmentId, filename) => {
    try {
      await apiCall(`/attachments/${selectedEmail.messageId}/download/${attachmentId}`, {
        method: 'POST',
        body: JSON.stringify({ filename })
      });
      
      window.open(`${API_BASE}/attachments/download/${filename}`);
      showMessage('附件下载成功', 'success');
    } catch (error) {
      // Error already shown by apiCall
    }
  };

  const loadDownloads = async () => {
    setLoadingState('downloads', true);
    try {
      const downloadsData = await apiCall('/status/downloads');
      const downloadList = [
        ...downloadsData.convertedEmails.map(file => ({ ...file, type: 'email' })),
        ...downloadsData.attachmentFiles.map(file => ({ ...file, type: 'attachment' }))
      ].sort((a, b) => new Date(b.created) - new Date(a.created));
      
      setDownloads(downloadList);
    } catch (error) {
      setDownloads([]);
    } finally {
      setLoadingState('downloads', false);
    }
  };

  const downloadFile = (filename, type) => {
    const url = type === 'email' 
      ? `${API_BASE}/emails/download/${filename}`
      : `${API_BASE}/attachments/download/${filename}`;
    window.open(url);
  };

  const deleteFile = async (filename, type) => {
    if (!window.confirm(`确定要删除文件 "${filename}" 吗？`)) {
      return;
    }
    
    try {
      const endpoint = type === 'email' 
        ? `/emails/downloads/${filename}`
        : `/attachments/cleanup/${filename}`;
        
      await apiCall(endpoint, { method: 'DELETE' });
      
      showMessage('文件删除成功', 'success');
      await loadDownloads();
      await checkSystemStatus();
    } catch (error) {
      // Error already shown by apiCall
    }
  };

  const cleanupFiles = async () => {
    if (!window.confirm('确定要清理所有文件吗？此操作不可撤销！')) {
      return;
    }
    
    setLoadingState('cleanup', true);
    try {
      const result = await apiCall('/status/cleanup', {
        method: 'POST',
        body: JSON.stringify({ type: 'all' })
      });
      
      showMessage(`清理完成！删除了 ${result.deletedCount} 个文件`, 'success');
      await checkSystemStatus();
      setDownloads([]);
    } catch (error) {
      // Error already shown by apiCall
    } finally {
      setLoadingState('cleanup', false);
    }
  };

  const getModeText = (mode) => {
    const modeMap = {
      'merged': '邮件+附件合并',
      'auto': '自动选择',
      'email_only': '仅邮件内容',
      'attachments_only': '仅附件'
    };
    return modeMap[mode] || mode;
  };

  const getAuthStatusText = () => {
    const statusMap = {
      'authenticated': '✅ 已认证',
      'not_configured': '❌ 未配置',
      'credentials_only': '⚠️ 需要授权',
      'auth_failed': '❌ 认证失败',
      'checking': '🔄 检查中...',
      'error': '❌ 检查失败'
    };
    return statusMap[authStatus] || '未知状态';
  };

  return (
    <div className="app">
      {/* 消息提示 */}
      <div className="message-area">
        {messages.map(msg => (
          <div key={msg.id} className={`alert alert-${msg.type}`}>
            <i className={`fas fa-${msg.type === 'success' ? 'check-circle' : msg.type === 'error' ? 'exclamation-circle' : 'info-circle'}`}></i>
            {msg.message}
          </div>
        ))}
      </div>

      <div className="container">
        <header className="header">
          <h1><i className="fas fa-envelope-open-text"></i> Gmail PDF 转换器</h1>
          <p>轻松将您的Gmail邮件转换为PDF文档</p>
        </header>

        {/* 状态卡片 */}
        <div className="card status-card">
          <h3><i className="fas fa-heartbeat"></i> 系统状态</h3>
          <div className="status-info">
            <span className={`status-indicator ${authStatus === 'authenticated' ? 'online' : authStatus === 'checking' ? 'loading' : 'offline'}`}></span>
            <span>
              {authStatus === 'authenticated' 
                ? `系统运行正常 (运行时间: ${systemStats.uptime || 0}小时)`
                : '系统连接失败'
              }
            </span>
          </div>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-number">{systemStats.totalFiles || '-'}</span>
              <span className="stat-label">总文件数</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{systemStats.totalSize ? formatFileSize(systemStats.totalSize) : '-'}</span>
              <span className="stat-label">总大小</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{systemStats.convertedEmails || '-'}</span>
              <span className="stat-label">转换邮件</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{systemStats.attachmentFiles || '-'}</span>
              <span className="stat-label">附件文件</span>
            </div>
          </div>
        </div>

        <div className="main-content">
          {/* 邮件列表 */}
          <div className="card">
            <h3><i className="fas fa-inbox"></i> 邮件列表</h3>
            <div className="button-group">
              <button 
                className="btn" 
                onClick={loadEmails}
                disabled={loading.emails}
              >
                {loading.emails ? <span className="loading"></span> : <i className="fas fa-refresh"></i>}
                刷新邮件
              </button>
              <button 
                className="btn" 
                onClick={() => setShowModeSelector(!showModeSelector)}
              >
                <i className="fas fa-cog"></i>
                转换设置 {showModeSelector ? '▲' : '▼'}
              </button>
              <button 
                className="btn btn-success" 
                onClick={convertLatestEmail}
                disabled={loading.convert}
              >
                {loading.convert ? <span className="loading"></span> : <i className="fas fa-file-pdf"></i>}
                转换最新邮件
              </button>
            </div>

            {/* 转换模式选择器 */}
            {showModeSelector && (
              <div className="mode-selector">
                <h4>转换模式</h4>
                <div className="mode-options">
                  <label className="mode-option">
                    <input 
                      type="radio" 
                      name="convertMode" 
                      value="merged" 
                      checked={convertMode === 'merged'}
                      onChange={(e) => setConvertMode(e.target.value)}
                    />
                    <span>邮件+PDF附件合并 (推荐)</span>
                  </label>
                  <label className="mode-option">
                    <input 
                      type="radio" 
                      name="convertMode" 
                      value="auto" 
                      checked={convertMode === 'auto'}
                      onChange={(e) => setConvertMode(e.target.value)}
                    />
                    <span>自动选择 (有PDF附件时合并，否则仅邮件)</span>
                  </label>
                  <label className="mode-option">
                    <input 
                      type="radio" 
                      name="convertMode" 
                      value="merged" 
                      checked={convertMode === 'merged'}
                      onChange={(e) => setConvertMode(e.target.value)}
                    />
                    <span>邮件+PDF附件合并 (推荐)</span>
                  </label>
                  <label className="mode-option">
                    <input 
                      type="radio" 
                      name="convertMode" 
                      value="auto" 
                      checked={convertMode === 'auto'}
                      onChange={(e) => setConvertMode(e.target.value)}
                    />
                    <span>自动选择 (有PDF附件时合并，否则仅邮件)</span>
                  </label>
                  <label className="mode-option">
                    <input 
                      type="radio" 
                      name="convertMode" 
                      value="email_only" 
                      checked={convertMode === 'email_only'}
                      onChange={(e) => setConvertMode(e.target.value)}
                    />
                    <span>仅邮件内容转PDF</span>
                  </label>
                  <label className="mode-option">
                    <input 
                      type="radio" 
                      name="convertMode" 
                      value="attachments_only" 
                      checked={convertMode === 'attachments_only'}
                      onChange={(e) => setConvertMode(e.target.value)}
                    />
                    <span>仅下载附件</span>
                  </label>
                </div>

                {/* 附件类型选择 */}
                {convertMode === 'attachments_only' && (
                  <div className="attachment-types">
                    <h5>附件类型</h5>
                    <div className="type-checkboxes">
                      {['pdf', 'images', 'documents', 'others'].map(type => (
                        <label key={type} className="type-checkbox">
                          <input 
                            type="checkbox" 
                            value={type}
                            checked={attachmentTypes.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAttachmentTypes([...attachmentTypes, type]);
                              } else {
                                setAttachmentTypes(attachmentTypes.filter(t => t !== type));
                              }
                            }}
                          />
                          <span>
                            {type === 'pdf' && 'PDF文件'}
                            {type === 'images' && '图片'}
                            {type === 'documents' && '文档'}
                            {type === 'others' && '其他'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="email-list">
              {emails.length === 0 ? (
                <div className="empty-state">
                  <i className="fas fa-envelope fa-3x"></i>
                  <p>点击"刷新邮件"加载邮件列表</p>
                </div>
              ) : (
                emails.map((email, index) => (
                  <div 
                    key={email.messageId} 
                    className={`email-item ${selectedEmail?.messageId === email.messageId ? 'selected' : ''}`}
                    onClick={() => selectEmail(email)}
                  >
                    <div className="email-subject">{email.subject || '(无主题)'}</div>
                    <div className="email-from">来自: {email.from}</div>
                    <div className="email-date">{formatDate(email.date)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 操作面板 */}
          <div className="card">
            <h3><i className="fas fa-cogs"></i> 操作面板</h3>
            <div className="button-group">
              <button 
                className="btn" 
                onClick={checkAuth}
                disabled={loading.auth}
              >
                <i className="fas fa-key"></i> {getAuthStatusText()}
              </button>
              <button 
                className="btn" 
                onClick={loadDownloads}
                disabled={loading.downloads}
              >
                {loading.downloads ? <span className="loading"></span> : <i className="fas fa-download"></i>}
                查看下载
              </button>
              <button 
                className="btn btn-danger" 
                onClick={cleanupFiles}
                disabled={loading.cleanup}
              >
                {loading.cleanup ? <span className="loading"></span> : <i className="fas fa-trash"></i>}
                清理文件
              </button>
            </div>

            {/* 选中邮件信息 */}
            {selectedEmail && (
              <div className="selected-email-info">
                <h4>选中邮件信息</h4>
                <div className="email-details">
                  <div><strong>主题:</strong> {selectedEmail.subject}</div>
                  <div><strong>发件人:</strong> {selectedEmail.from}</div>
                  <div><strong>日期:</strong> {formatDate(selectedEmail.date)}</div>
                  <div><strong>预览:</strong> {selectedEmail.snippet}</div>
                </div>
                <div className="button-group">
                  <button 
                    className="btn btn-success" 
                    onClick={convertSelectedEmail}
                    disabled={loading.convertSelected}
                  >
                    {loading.convertSelected ? <span className="loading"></span> : <i className="fas fa-file-pdf"></i>}
                    转换此邮件
                  </button>
                  <button 
                    className="btn" 
                    onClick={viewAttachments}
                    disabled={loading.attachments}
                  >
                    {loading.attachments ? <span className="loading"></span> : <i className="fas fa-paperclip"></i>}
                    查看附件
                  </button>
                </div>
              </div>
            )}

            {/* 附件列表 */}
            {attachments.length > 0 && (
              <div className="attachments-section">
                <h4>附件列表 ({attachments.length}个, {attachments.filter(a => a.isPdf).length}个PDF)</h4>
                {attachments.map(att => (
                  <div key={att.attachmentId} className="download-item">
                    <div className="download-info">
                      <div><strong>{att.filename}</strong></div>
                      <div className="file-size">{att.mimeType} - {formatFileSize(att.size)}</div>
                    </div>
                    <div className="download-actions">
                      <button 
                        className="btn" 
                        onClick={() => downloadAttachment(att.attachmentId, att.filename)}
                      >
                        <i className="fas fa-download"></i> 下载
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 下载文件列表 */}
            {downloads.length > 0 && (
              <div className="downloads-section">
                <h4>下载文件 (共{downloads.length}个)</h4>
                {downloads.map(file => (
                  <div key={file.filename} className="download-item">
                    <div className="download-info">
                      <div><strong>{file.filename}</strong></div>
                      <div className="file-size">
                        {file.type === 'email' ? '📧' : '📎'} {formatFileSize(file.size)} - {formatDate(file.created)}
                      </div>
                    </div>
                    <div className="download-actions">
                      <button 
                        className="btn" 
                        onClick={() => downloadFile(file.filename, file.type)}
                      >
                        <i className="fas fa-download"></i> 下载
                      </button>
                      <button 
                        className="btn btn-danger" 
                        onClick={() => deleteFile(file.filename, file.type)}
                      >
                        <i className="fas fa-trash"></i> 删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;