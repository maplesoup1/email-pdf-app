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
  const [currentProvider, setCurrentProvider] = useState('gmail');
  const [availableProviders, setAvailableProviders] = useState([]);
  const [showProviderSelector, setShowProviderSelector] = useState(false);

  // 工具函数
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US');
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
        throw new Error(data.error || 'Request failed');
      }
      
      return data.data;
    } catch (error) {
      console.error('API call failed:', error);
      showMessage(`Error: ${error.message}`, 'error');
      throw error;
    }
  };

  // 初始化
  useEffect(() => {
    checkSystemStatus();
    checkAuth();
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const providers = await apiCall('/providers/list');
      setAvailableProviders(providers.providers);
      setCurrentProvider(providers.currentProvider);
    } catch (error) {
      console.error('Load email providers failed:', error);
    }
  };

  const switchProvider = async (provider) => {
    setLoadingState('switchProvider', true);
    try {
      await apiCall('/providers/switch', {
        method: 'POST',
        body: JSON.stringify({ provider })
      });
      
      setCurrentProvider(provider);
      showMessage(`Switched to ${getProviderDisplayName(provider)}`, 'success');
      
      // Re-check authentication status
      await checkAuth();
      
      // Clear current email list
      setEmails([]);
      setSelectedEmail(null);
      setAttachments([]);
    } catch (error) {
      // Error already shown by apiCall
    } finally {
      setLoadingState('switchProvider', false);
    }
  };

  const getProviderDisplayName = (provider) => {
    const displayNames = {
      'gmail': 'Gmail',
      'outlook': 'Outlook / Microsoft 365',
      'yahoo': 'Yahoo Mail',
      'icloud': 'iCloud Mail'
    };
    return displayNames[provider] || provider;
  };

  const getProviderIcon = (provider) => {
    const icons = {
      'gmail': <i className="fab fa-google"></i>,
      'outlook': <i className="fab fa-microsoft"></i>,
      'yahoo': <i className="fab fa-yahoo"></i>,
      'icloud': <i className="fab fa-apple"></i>
    };
    return icons[provider] || <i className="fas fa-envelope"></i>;
  };

  const openOutlookAuth = async () => {
    try {
      const authData = await apiCall('/providers/outlook/auth');
      window.open(authData.authUrl, '_blank', 'width=600,height=700');
      showMessage('Please complete authentication in the new window', 'info');
      
      // Check auth status after a delay
      setTimeout(async () => {
        await checkAuth();
        await loadProviders();
      }, 3000);
    } catch (error) {
      showMessage('Failed to open authentication page', 'error');
    }
  };

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
      console.error('Get system status failed:', error);
    }
  };

  const checkAuth = async () => {
    setLoadingState('auth', true);
    try {
      const authData = await apiCall('/status/auth');
      setAuthStatus(authData.authStatus);
      
      if (authData.authStatus !== 'authenticated') {
        showMessage(authData.errorMessage || 'Authentication not completed', 'error');
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
      const emailData = await apiCall(`/emails/list?maxResults=20&provider=${currentProvider}`);
      setEmails(emailData.emails);
      showMessage(`Successfully loaded ${emailData.emails.length} emails from ${getProviderDisplayName(currentProvider)}`, 'success');
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
          attachmentTypes: attachmentTypes,
          provider: currentProvider
        })
      });
      
      showMessage(`Convert successful! Mode: ${getModeText(result.mode)} (${getProviderDisplayName(currentProvider)})`, 'success');
      
      // Download generated files
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
      showMessage('Please select an email first', 'error');
      return;
    }
    
    setLoadingState('convertSelected', true);
    try {
      const result = await apiCall(`/emails/convert/${selectedEmail.messageId}`, { 
        method: 'POST',
        body: JSON.stringify({ 
          mode: convertMode,
          attachmentTypes: attachmentTypes,
          provider: currentProvider
        })
      });
      
      showMessage(`Convert successful! Mode: ${getModeText(result.mode)} (${getProviderDisplayName(currentProvider)})`, 'success');
      
      // Download generated files
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
      showMessage('Please select an email first', 'error');
      return;
    }
    
    setLoadingState('attachments', true);
    try {
      const attachmentData = await apiCall(`/attachments/${selectedEmail.messageId}/list?provider=${currentProvider}`);
      setAttachments(attachmentData.attachments);
      
      if (attachmentData.attachments.length === 0) {
        showMessage('This email has no attachments', 'info');
      }
    } catch (error) {
      setAttachments([]);
    } finally {
      setLoadingState('attachments', false);
    }
  };

  const downloadAttachment = async (attachmentId, filename) => {
    try {
      await apiCall(`/attachments/${selectedEmail.messageId}/download/${attachmentId}?provider=${currentProvider}`, {
        method: 'POST',
        body: JSON.stringify({ filename })
      });
      
      window.open(`${API_BASE}/attachments/download/${filename}`);
      showMessage('Attachment download successful', 'success');
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
      showMessage('PDF analysis completed', 'success');
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
      
      showMessage(`Split successful! Generated ${result.separatedFiles.length} files`, 'success');
      
      // Auto download separated files
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
    if (!window.confirm(`Are you sure you want to delete file "${filename}"?`)) {
      return;
    }
    
    try {
      const endpoint = type === 'email' 
        ? `/emails/downloads/${filename}`
        : `/attachments/cleanup/${filename}`;
        
      await apiCall(endpoint, { method: 'DELETE' });
      
      showMessage('File deleted successfully', 'success');
      await loadDownloads();
      await checkSystemStatus();
    } catch (error) {
      // Error already shown by apiCall
    }
  };

  const cleanupFiles = async () => {
    if (!window.confirm('Are you sure you want to clean all files? This operation cannot be undone!')) {
      return;
    }
    
    setLoadingState('cleanup', true);
    try {
      const result = await apiCall('/status/cleanup', {
        method: 'POST',
        body: JSON.stringify({ type: 'all' })
      });
      
      showMessage(`Cleanup completed! Deleted ${result.deletedCount} files`, 'success');
      await checkSystemStatus();  // 刷新状态面板统计数字
      await loadDownloads();      // 刷新下载列表
      setSelectedEmail(null);     // 清除选中 email（如果你想更干净）
      setAttachments([]);         // 清空附件列表
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
      'authenticated': 'Authenticated',
      'not_configured': '❌ Not configured',
      'credentials_only': '⚠️ Need authorization',
      'auth_failed': '❌ Auth failed',
      'checking': '🔄 Checking...',
      'error': '❌ Error'
    };
    return statusMap[authStatus] || 'Unknown status';
  };

  return (
    <div className="app">
      {/* Message notifications */}
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
                ? `System connect good (Operating time: ${systemStats.uptime || 0} hours)`
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
          {/* Email list */}
          <div className="card">
            <h3><i className="fas fa-inbox"></i> Email list - {getProviderDisplayName(currentProvider)}</h3>
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
                onClick={() => setShowProviderSelector(!showProviderSelector)}
              >
                <i className="fas fa-exchange-alt"></i>
                Switch Email {showProviderSelector ? '▲' : '▼'}
              </button>
              <button 
                className="btn" 
                onClick={() => setShowModeSelector(!showModeSelector)}
              >
                <i className="fas fa-cog"></i>
                Change setting {showModeSelector ? '▲' : '▼'}
              </button>
            </div>

            {/* Email provider selector */}
            {showProviderSelector && (
              <div className="provider-selector">
                <h4>Select Email Service</h4>
                <div className="provider-options">
                {availableProviders.map(provider => (
                <button
                  key={provider.name}
                  className={`btn provider-btn ${provider.name === currentProvider ? 'btn-success' : ''}`}
                  onClick={() => switchProvider(provider.name)}
                  disabled={loading.switchProvider || provider.name === currentProvider}
                >
                  {getProviderIcon(provider.name)} {provider.displayName}
                  {provider.name === currentProvider && ' ✓'}
                </button>
                ))}
                </div>
                <div className="provider-info">
                  <p><strong>Current:</strong> {getProviderDisplayName(currentProvider)}</p>
                  <p><small>Switching email service requires re-authentication</small></p>
                  {currentProvider === 'outlook' && authStatus !== 'authenticated' && (
                    <button className="btn btn-success" onClick={openOutlookAuth}>
                      <i className="fab fa-microsoft"></i> Authenticate Outlook
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Convert mode selector */}
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
                    <span>Merge email + PDF attachments (default, no PDF = email only)</span>
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

                {/* Attachment type selection */}
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
                  <p>Click refresh to load email messages</p>
                </div>
              ) : (
                emails.map((email) => (
                  <div 
                    key={email.messageId} 
                    className={`email-item ${selectedEmail?.messageId === email.messageId ? 'selected' : ''}`}
                    onClick={() => selectEmail(email)}
                  >
                    <div className="email-subject">{email.subject || '(No subject)'}</div>
                    <div className="email-from">From: {email.from}</div>
                    <div className="email-date">{formatDate(email.date)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Operation panel */}
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
                Check download
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
            </div>
            <button 
                className="btn btn-danger" 
                onClick={cleanupFiles}
                disabled={loading.cleanup}
                style={{
                  minWidth: '100%'
                }}
              >
                {loading.cleanup ? <span className="loading"></span> : <i className="fas fa-trash"></i>}
                Clean cache
              </button>

            {/* Selected email info */}
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

            {/* Attachment list */}
            {attachments.length > 0 && (
              <div className="attachments-section">
                <h4>Attachment list ({attachments.length} total, {attachments.filter(a => a.isPdf).length} PDF)</h4>
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

            {/* PDF demerge panel */}
            {showDemergePanel && (
              <div className="demerge-panel">
                <h4>PDF demerge</h4>
                <p>Split merged PDF files back to original email content and attachments</p>
                
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
                            Analyze
                          </button>
                          <button 
                            className="btn btn-success btn-small" 
                            onClick={() => demergePDF(file.filename)}
                            disabled={loading.demerge}
                          >
                            {loading.demerge ? <span className="loading"></span> : <i className="fas fa-scissors"></i>}
                            Split
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Demerge settings */}
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

            {/* Download file list */}
            {downloads.length > 0 && (
              <div className="downloads-section">
                <h4>Download ({downloads.length} in total)</h4>
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