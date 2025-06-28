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
  const [mergedFiles, setMergedFiles] = useState([]);
  const [showDemergePanel, setShowDemergePanel] = useState(false);
  const [selectedMergedFile, setSelectedMergedFile] = useState(null);
  const [demergeSettings, setDemergeSettings] = useState({
    emailPageCount: 1,
    attachmentInfo: []
  });

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

  const loadMergedFiles = async () => {
    setLoadingState('mergedFiles', true);
    try {
      const mergedData = await apiCall('/demerge/list');
      setMergedFiles(mergedData);
    } catch (error) {
      setMergedFiles([]);
    } finally {
      setLoadingState('mergedFiles', false);
    }
  };

  const analyzeMergedFile = async (filename) => {
    setLoadingState('analyze', true);
    try {
      const analysis = await apiCall(`/demerge/analyze/${filename}`);
      setDemergeSettings({
        emailPageCount: analysis.estimatedEmailPages,
        attachmentInfo: analysis.suggestedSplit.filter(s => s.type === 'attachment').map(s => ({
          originalName: s.originalName,
          pageCount: s.pageCount
        }))
      });
      showMessage('PDF分析完成', 'success');
    } catch (error) {
      // Error already shown by apiCall
    } finally {
      setLoadingState('analyze', false);
    }
  };

  const demergePDF = async (filename) => {
    setLoadingState('demerge', true);
    try {
      const result = await apiCall(`/demerge/split/${filename}`, {
        method: 'POST',
        body: JSON.stringify(demergeSettings)
      });
      
      showMessage(`分离成功！生成了 ${result.separatedFiles.length} 个文件`, 'success');
      
      // 自动下载分离后的文件
      result.separatedFiles.forEach((file, index) => {
        const downloadUrl = file.type === 'email' 
          ? `${API_BASE}/emails/download/${file.filename}`
          : `${API_BASE}/attachments/download/${file.filename}`;
        setTimeout(() => window.open(downloadUrl), index * 500);
      });
      
      await checkSystemStatus();
      await loadMergedFiles();
    } catch (error) {
      // Error already shown by apiCall
    } finally {
      setLoadingState('demerge', false);
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
      'merged': 'Email + Attachment',
      'merged_fallback': 'Email + Attachment (No PDF attachment, Email only)',
      'auto': 'Auto',
      'email_only': 'Email only',
      'attachments_only': 'Attachment only'
    };
    return modeMap[mode] || mode;
  };

  const getAuthStatusText = () => {
    const statusMap = {
      'authenticated': 'authenticated',
      'not_configured': '❌ not_configured',
      'credentials_only': '⚠️ credentials_only',
      'auth_failed': '❌ auth_failed',
      'checking': '🔄 checking',
      'error': '❌ error'
    };
    return statusMap[authStatus] || 'Unknown status';
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
          <h1><i className="fas fa-envelope-open-text"></i> Gmail and attachment to PDF</h1>
        </header>

        <div className="card status-card">
          <h3><i className="fas fa-heartbeat"></i> Status</h3>
          <div className="status-info">
            <span className={`status-indicator ${authStatus === 'authenticated' ? 'online' : authStatus === 'checking' ? 'loading' : 'offline'}`}></span>
            <span>
              {authStatus === 'authenticated' 
                ? `System connect good (Operating time: ${systemStats.uptime || 0}小时)`
                : 'System connect fail'
              }
            </span>
          </div>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-number">{systemStats.totalFiles || '-'}</span>
              <span className="stat-label">Total files count</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{systemStats.totalSize ? formatFileSize(systemStats.totalSize) : '-'}</span>
              <span className="stat-label">Size</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{systemStats.convertedEmails || '-'}</span>
              <span className="stat-label">Converted Email</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{systemStats.attachmentFiles || '-'}</span>
              <span className="stat-label">Attachment file</span>
            </div>
          </div>
        </div>

        <div className="main-content">
          {/* 邮件列表 */}
          <div className="card">
            <h3><i className="fas fa-inbox"></i> Email list</h3>
            <div className="button-group">
              <button 
                className="btn" 
                onClick={loadEmails}
                disabled={loading.emails}
              >
                {loading.emails ? <span className="loading"></span> : <i className="fas fa-refresh"></i>}
                Refresh
              </button>
              <button 
                className="btn" 
                onClick={() => setShowModeSelector(!showModeSelector)}
              >
                <i className="fas fa-cog"></i>
                Change settting {showModeSelector ? '▲' : '▼'}
              </button>
              <button 
                className="btn btn-success" 
                onClick={convertLatestEmail}
                disabled={loading.convert}
              >
                {loading.convert ? <span className="loading"></span> : <i className="fas fa-file-pdf"></i>}
                Change to newest email
              </button>
            </div>

            {/* 转换模式选择器 */}
            {showModeSelector && (
              <div className="mode-selector">
                <h4>Change mode</h4>
                <div className="mode-options">
                  <label className="mode-option">
                    <input 
                      type="radio" 
                      name="convertMode" 
                      value="merged" 
                      checked={convertMode === 'merged'}
                      onChange={(e) => setConvertMode(e.target.value)}
                    />
                    <span>Merge email + PDF attachments (default)</span>
                  </label>
                  <label className="mode-option">
                    <input 
                      type="radio" 
                      name="convertMode" 
                      value="email_only" 
                      checked={convertMode === 'email_only'}
                      onChange={(e) => setConvertMode(e.target.value)}
                    />
                    <span>Email to pdf only</span>
                  </label>
                  <label className="mode-option">
                    <input 
                      type="radio" 
                      name="convertMode" 
                      value="attachments_only" 
                      checked={convertMode === 'attachments_only'}
                      onChange={(e) => setConvertMode(e.target.value)}
                    />
                    <span>Attachment only</span>
                  </label>
                </div>

                {/* 附件类型选择 */}
                {convertMode === 'attachments_only' && (
                  <div className="attachment-types">
                    <h5>Attachment Type</h5>
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
                            {type === 'pdf' && 'PDF'}
                            {type === 'images' && 'Image'}
                            {type === 'documents' && 'Document'}
                            {type === 'others' && 'Other'}
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
                  <p>Click refresh to load emial massage</p>
                </div>
              ) : (
                emails.map((email) => (
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
            <h3><i className="fas fa-cogs"></i> Operation panel</h3>
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
                check downlaod
              </button>
              <button 
                className="btn" 
                onClick={() => {
                  setShowDemergePanel(!showDemergePanel);
                  if (!showDemergePanel) loadMergedFiles();
                }}
                disabled={loading.mergedFiles}
              >
                {loading.mergedFiles ? <span className="loading"></span> : <i className="fas fa-scissors"></i>}
                PDF demerge {showDemergePanel ? '▲' : '▼'}
              </button>
              <button 
                className="btn btn-danger" 
                onClick={cleanupFiles}
                disabled={loading.cleanup}
              >
                {loading.cleanup ? <span className="loading"></span> : <i className="fas fa-trash"></i>}
                Clean cache
              </button>
            </div>

            {/* 选中邮件信息 */}
            {selectedEmail && (
              <div className="selected-email-info">
                <h4>Selected email message</h4>
                <div className="email-details">
                  <div><strong>Topic:</strong> {selectedEmail.subject}</div>
                  <div><strong>Sender:</strong> {selectedEmail.from}</div>
                  <div><strong>Date:</strong> {formatDate(selectedEmail.date)}</div>
                  <div><strong>Preview:</strong> {selectedEmail.snippet}</div>
                </div>
                <div className="button-group">
                  <button 
                    className="btn btn-success" 
                    onClick={convertSelectedEmail}
                    disabled={loading.convertSelected}
                  >
                    {loading.convertSelected ? <span className="loading"></span> : <i className="fas fa-file-pdf"></i>}
                    Convert this email
                  </button>
                  <button 
                    className="btn" 
                    onClick={viewAttachments}
                    disabled={loading.attachments}
                  >
                    {loading.attachments ? <span className="loading"></span> : <i className="fas fa-paperclip"></i>}
                    View attachment
                  </button>
                </div>
              </div>
            )}

            {/* 附件列表 */}
            {attachments.length > 0 && (
              <div className="attachments-section">
                <h4>Attachment list ({attachments.length}个, {attachments.filter(a => a.isPdf).length}个PDF)</h4>
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
                        <i className="fas fa-download"></i> Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* PDF分离面板 */}
            {showDemergePanel && (
              <div className="demerge-panel">
                <h4>PDF demerge</h4>
                <p>demerge</p>
                
                {mergedFiles.length === 0 ? (
                  <div className="empty-state">
                    <i className="fas fa-file-pdf fa-2x"></i>
                    <p>Merged file not found</p>
                  </div>
                ) : (
                  <div className="merged-files-list">
                    {mergedFiles.map(file => (
                      <div key={file.filename} className="merged-file-item">
                        <div className="file-info">
                          <div><strong>{file.filename}</strong></div>
                          <div className="file-size">
                            {formatFileSize(file.size)} - {formatDate(file.created)}
                          </div>
                        </div>
                        <div className="file-actions">
                          <button 
                            className="btn btn-small" 
                            onClick={() => {
                              setSelectedMergedFile(file);
                              analyzeMergedFile(file.filename);
                            }}
                            disabled={loading.analyze}
                          >
                            {loading.analyze && selectedMergedFile?.filename === file.filename ? 
                              <span className="loading"></span> : <i className="fas fa-search"></i>
                            }
                            check
                          </button>
                          <button 
                            className="btn btn-success btn-small" 
                            onClick={() => demergePDF(file.filename)}
                            disabled={loading.demerge}
                          >
                            {loading.demerge ? <span className="loading"></span> : <i className="fas fa-scissors"></i>}
                            分离
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* 分离设置 */}
                {selectedMergedFile && (
                  <div className="demerge-settings">
                    <h5>Demerge setting - {selectedMergedFile.filename}</h5>
                    <div className="setting-group">
                      <label>
                        Email page number:
                        <input 
                          type="number" 
                          min="1" 
                          value={demergeSettings.emailPageCount}
                          onChange={(e) => setDemergeSettings({
                            ...demergeSettings,
                            emailPageCount: parseInt(e.target.value) || 1
                          })}
                        />
                      </label>
                    </div>
                    
                    <div className="attachment-settings">
                      <label>Attachment information:</label>
                      {demergeSettings.attachmentInfo.map((att, index) => (
                        <div key={index} className="attachment-setting">
                          <input 
                            type="text" 
                            placeholder="Attachment name"
                            value={att.originalName}
                            onChange={(e) => {
                              const newAttachments = [...demergeSettings.attachmentInfo];
                              newAttachments[index].originalName = e.target.value;
                              setDemergeSettings({
                                ...demergeSettings,
                                attachmentInfo: newAttachments
                              });
                            }}
                          />
                          <input 
                            type="number" 
                            placeholder="page"
                            min="1"
                            value={att.pageCount}
                            onChange={(e) => {
                              const newAttachments = [...demergeSettings.attachmentInfo];
                              newAttachments[index].pageCount = parseInt(e.target.value) || 1;
                              setDemergeSettings({
                                ...demergeSettings,
                                attachmentInfo: newAttachments
                              });
                            }}
                          />
                          <button 
                            className="btn btn-danger btn-small"
                            onClick={() => {
                              const newAttachments = demergeSettings.attachmentInfo.filter((_, i) => i !== index);
                              setDemergeSettings({
                                ...demergeSettings,
                                attachmentInfo: newAttachments
                              });
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                      <button 
                        className="btn btn-small"
                        onClick={() => {
                          setDemergeSettings({
                            ...demergeSettings,
                            attachmentInfo: [
                              ...demergeSettings.attachmentInfo,
                              { originalName: 'attachment.pdf', pageCount: 1 }
                            ]
                          });
                        }}
                      >
                        <i className="fas fa-plus"></i> Add attachment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 下载文件列表 */}
            {downloads.length > 0 && (
              <div className="downloads-section">
                <h4>Downlaod ({downloads.length} in total)</h4>
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
                        <i className="fas fa-download"></i> Download
                      </button>
                      <button 
                        className="btn btn-danger" 
                        onClick={() => deleteFile(file.filename, file.type)}
                      >
                        <i className="fas fa-trash"></i> Delete
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