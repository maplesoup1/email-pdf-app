import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE = 'http://localhost:3000/api';

function App() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [systemStats, setSystemStats] = useState({});
  const [authStatus, setAuthStatus] = useState('checking');
  const [loading, setLoading] = useState({});
  const [load, setLoad] = useState({});
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
  
  const [downloadSettings, setDownloadSettings] = useState({
    useCustomPath: false,
    customPath: '',
    autoCreateFolder: true,
    folderNaming: 'date'
  });
  const [showDownloadSettings, setShowDownloadSettings] = useState(false);
  const [suggestedPaths, setSuggestedPaths] = useState([]);


  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateSession = async (sessionId) => {
    try {
      const res = await fetch(`${API_BASE}/auth/validate/${sessionId}`);
      const data = await res.json();
      return data.valid; // true or false
    } catch (e) {
      return false;
    }
  };

  const handleToAuthUrl = async () => {
    try {
      setLoad(prev => ({ ...prev, auth: true }));
  
      const oldSessionId = localStorage.getItem('sessionId');
  
      // 验证旧 sessionId 是否还能用（后端验证）
      if (oldSessionId) {
        const valid = await validateSession(oldSessionId);
        if (!valid) {
          localStorage.removeItem('sessionId');
        }
      }
  
      const response = await fetch(`${API_BASE}/auth/start`);
      const res = await response.json();
  
      if (res.authUrl && res.sessionId) {
        localStorage.setItem('sessionId', res.sessionId);
        window.open(res.authUrl, '_blank');
        showMessage('Please complete authentication in the new window', 'info');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Failed to get auth URL:', error);
      showMessage('Failed to get authentication URL', 'error');
    } finally {
      setLoad(prev => ({ ...prev, auth: false }));
    }
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

  const getSuggestedPaths = async () => {
    try {
      const result = await apiCall('/settings/suggested-paths');
      setSuggestedPaths(result.suggestions || []);
    } catch (error) {
      console.error('Failed to get suggested paths:', error);
    }
  };

  const validatePath = async (path) => {
    try {
      const result = await apiCall('/settings/validate-path', {
        method: 'POST',
        body: JSON.stringify({ path })
      });
      return result;
    } catch (error) {
      return { exists: false, writable: false, canCreate: false };
    }
  };

  const updateDownloadSettings = async (newSettings) => {
    try {
      const result = await apiCall('/settings/download-path', {
        method: 'POST',
        body: JSON.stringify(newSettings)
      });
      
      setDownloadSettings(result);
      showMessage('Download settings saved successfully', 'success');
    } catch (error) {
      // Error already shown by apiCall
    }
  };

  const getDownloadSettings = async () => {
    try {
      const settings = await apiCall('/settings/download-path');
      setDownloadSettings(settings);
    } catch (error) {
      console.error('Failed to get download settings:', error);
    }
  };

  const generatePathPreview = () => {
    if (!downloadSettings.useCustomPath || !downloadSettings.customPath) {
      return 'Use browser default download location';
    }
    
    let previewPath = downloadSettings.customPath;
    
    if (downloadSettings.folderNaming === 'date') {
      const today = new Date().toISOString().split('T')[0];
      previewPath += `/${today}`;
    } else if (downloadSettings.folderNaming === 'email') {
      previewPath += '/[Email Subject]';
    }
    
    return previewPath;
  };

  useEffect(() => {
    checkSystemStatus();
    checkAuth();
    loadProviders();
    getDownloadSettings();
    getSuggestedPaths();
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
      
      await checkAuth();
      
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
  
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
      showMessage('Missing session ID. Please authenticate first.', 'error');
      setLoadingState('emails', false);
      return;
    }
  
    try {
      const emailData = await apiCall(`/emails/list?maxResults=20&sessionId=${sessionId}`);
      setEmails(emailData.emails);
      showMessage(`Successfully loaded ${emailData.emails.length} emails from session`, 'success');
    } catch (error) {
      console.error('Failed to load emails:', error);
      setEmails([]);
      showMessage('Failed to load emails', 'error');
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
          provider: currentProvider,
          downloadSettings: downloadSettings
        })
      });
      
      showMessage(`Convert successful! Mode: ${getModeText(result.mode)} (${getProviderDisplayName(currentProvider)})`, 'success');
      
      if (result.useCustomPath && result.downloadPath) {
        showMessage(`Files saved to: ${result.downloadPath}`, 'info');
      } else {
        result.files.forEach(file => {
          if (file.type === 'email_pdf' || file.type === 'merged_pdf') {
            window.open(`${API_BASE}/emails/download/${file.filename}`);
          } else if (file.type === 'attachment') {
            window.open(`${API_BASE}/attachments/download/${file.filename}`);
          }
        });
      }
      
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
      const sessionId = localStorage.getItem('sessionId');
      const result = await apiCall(`/emails/convert/${selectedEmail.messageId}`, { 
        method: 'POST',
        body: JSON.stringify({ 
          mode: convertMode,
          attachmentTypes: attachmentTypes,
          provider: currentProvider,
          downloadSettings: downloadSettings,
          sessionId: sessionId
        })
      });
      
      showMessage(`Convert successful! Mode: ${getModeText(result.mode)} (${getProviderDisplayName(currentProvider)})`, 'success');
      
      if (result.useCustomPath && result.downloadPath) {
        showMessage(`Files saved to: ${result.downloadPath}`, 'info');
      } else {
        result.files.forEach(file => {
          if (file.type === 'email_pdf' || file.type === 'merged_pdf') {
            window.open(`${API_BASE}/emails/download/${file.filename}`);
          } else if (file.type === 'attachment') {
            window.open(`${API_BASE}/attachments/download/${file.filename}`);
          }
        });
      }
      
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
      await checkSystemStatus();
      await loadDownloads();
      setSelectedEmail(null);
      setAttachments([]);
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

  const renderDownloadSettings = () => (
    <>
      <button 
        className="btn" 
        onClick={() => setShowDownloadSettings(!showDownloadSettings)}
      >
        <i className="fas fa-folder"></i>
        Download Settings {showDownloadSettings ? '▲' : '▼'}
      </button>

      {showDownloadSettings && (
        <div className="download-settings-panel">
          <h4>Download Path Settings</h4>
          
          <div className="setting-group">
            <label className="setting-option">
              <input 
                type="checkbox" 
                checked={downloadSettings.useCustomPath}
                onChange={(e) => {
                  setDownloadSettings({
                    ...downloadSettings,
                    useCustomPath: e.target.checked
                  });
                }}
              />
              <span>Use custom download path</span>
            </label>
          </div>

          {downloadSettings.useCustomPath && (
            <>
              <div className="setting-group">
                <label>
                  Download path:
                  <input 
                    type="text" 
                    value={downloadSettings.customPath}
                    onChange={(e) => setDownloadSettings({
                      ...downloadSettings,
                      customPath: e.target.value
                    })}
                    placeholder="Enter download path..."
                    className="path-input"
                  />
                </label>
                
                {suggestedPaths.length > 0 && (
                  <div className="suggested-paths">
                    <label>Quick select:</label>
                    <div className="path-buttons">
                      {suggestedPaths.map((pathObj, index) => (
                        <button
                          key={index}
                          className={`path-btn ${pathObj.exists ? 'exists' : 'create'}`}
                          onClick={() => setDownloadSettings({
                            ...downloadSettings,
                            customPath: pathObj.path
                          })}
                        >
                          {pathObj.exists ? '📁' : '📂'} {pathObj.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="setting-group">
                <label className="setting-option">
                  <input 
                    type="checkbox" 
                    checked={downloadSettings.autoCreateFolder}
                    onChange={(e) => setDownloadSettings({
                      ...downloadSettings,
                      autoCreateFolder: e.target.checked
                    })}
                  />
                  <span>Auto create folder (if not exists)</span>
                </label>
              </div>

              <div className="setting-group">
                <label>Folder organization:</label>
                <div className="folder-naming-options">
                  <label className="setting-option">
                    <input 
                      type="radio" 
                      name="folderNaming" 
                      value="date" 
                      checked={downloadSettings.folderNaming === 'date'}
                      onChange={(e) => setDownloadSettings({
                        ...downloadSettings,
                        folderNaming: e.target.value
                      })}
                    />
                    <span>Group by date (e.g., 2025-06-30)</span>
                  </label>
                  <label className="setting-option">
                    <input 
                      type="radio" 
                      name="folderNaming" 
                      value="email" 
                      checked={downloadSettings.folderNaming === 'email'}
                      onChange={(e) => setDownloadSettings({
                        ...downloadSettings,
                        folderNaming: e.target.value
                      })}
                    />
                    <span>Group by email subject</span>
                  </label>
                  <label className="setting-option">
                    <input 
                      type="radio" 
                      name="folderNaming" 
                      value="flat" 
                      checked={downloadSettings.folderNaming === 'flat'}
                      onChange={(e) => setDownloadSettings({
                        ...downloadSettings,
                        folderNaming: e.target.value
                      })}
                    />
                    <span>No grouping (save directly to specified path)</span>
                  </label>
                </div>
              </div>

              <div className="setting-actions">
                <button 
                  className="btn btn-success" 
                  onClick={() => updateDownloadSettings(downloadSettings)}
                >
                  <i className="fas fa-save"></i> Save Settings
                </button>
              </div>
            </>
          )}

          <div className="settings-preview">
            <h6>Preview save location:</h6>
            <div className="preview-path">
              {generatePathPreview()}
            </div>
          </div>

          <div className="download-info">
            <h5>Current download method:</h5>
            <p>
              {downloadSettings.useCustomPath 
                ? `📁 Custom: ${downloadSettings.customPath || '(not set)'}`
                : '🌐 Browser default download'
              }
            </p>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="app">
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
          <h1><i className="fas fa-envelope-open-text"></i> Email and attachment to PDF</h1>
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
              <button 
                className="btn" 
                onClick={handleToAuthUrl}
                disabled={loading.auth}
              >
                Gmail Auth
              </button>
            </div>

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
              {renderDownloadSettings()}
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