import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE = 'http://localhost:3000/api';

function App() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loading, setLoading] = useState({});
  const [messages, setMessages] = useState([]);
  const [mergedFiles, setMergedFiles] = useState([]);
  const [showDemergePanel, setShowDemergePanel] = useState(false);
  const [selectedMergedFile, setSelectedMergedFile] = useState(null);
  const [demergeSettings, setDemergeSettings] = useState({
    emailPageCount: 1,
    attachmentInfo: []
  });
  const [downloadSettings, setDownloadSettings] = useState({
    useCustomPath: false,
    customPath: ''
  });
  const [showDownloadSettings, setShowDownloadSettings] = useState(false);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleToAuthUrl = async () => {
    try {
      setLoadingState('auth', true);
      
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
      setLoadingState('auth', false);
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
      return data;
    } catch (error) {
      console.error('API call failed:', error);
      showMessage(`Error: ${error.message}`, 'error');
      throw error;
    }
  };

  const updateDownloadSettings = async (newSettings) => {
    try {
      const result = await apiCall('/settings', {
        method: 'POST',
        body: JSON.stringify(newSettings)
      });
      
      if (result.success) {
        setDownloadSettings(result.data);
        showMessage('Download settings saved successfully', 'success');
      } else {
        throw new Error(result.error || 'Failed to save settings');
      }
    } catch (error) {
      showMessage(`Error saving settings: ${error.message}`, 'error');
    }
  };

  const getDownloadSettings = async () => {
    try {
      const result = await apiCall('/settings');
      if (result.success) {
        setDownloadSettings(result.data);
      }
    } catch (error) {
      console.error('Failed to get download settings:', error);
    }
  };

  const generatePathPreview = () => {
    if (!downloadSettings.useCustomPath || !downloadSettings.customPath) {
      return 'Use server default download location';
    }
    return downloadSettings.customPath;
  };

  useEffect(() => {
    getDownloadSettings();
  }, []);

  const loadEmails = async () => {
    setLoadingState('emails', true);
  
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
      showMessage('Missing session ID. Please authenticate first.', 'error');
      setLoadingState('emails', false);
      return;
    }
  
    try {
      const response = await apiCall(`/emails/list?sessionId=${sessionId}&maxResults=20`);
      if (response.success) {
        setEmails(response.data.emails);
        showMessage(`Successfully loaded ${response.data.emails.length} emails`, 'success');
      } else {
        throw new Error(response.error || 'Failed to load emails');
      }
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
          sessionId: sessionId,
          outputDir: downloadSettings.useCustomPath ? downloadSettings.customPath : undefined
        })
      });
      
      if (result.success) {
        showMessage('Email converted successfully!', 'success');
        if (result.data.pdfPath) {
          showMessage(`PDF saved as: ${result.data.fileName}`, 'info');
        }
      } else {
        throw new Error(result.error || 'Conversion failed');
      }
    } catch (error) {
      showMessage(`Conversion failed: ${error.message}`, 'error');
    } finally {
      setLoadingState('convertSelected', false);
    }
  };

  const loadMergedFiles = async () => {
    setLoadingState('mergedFiles', true);
    try {
      const result = await apiCall('/demerge/list');
      if (result.success) {
        setMergedFiles(result.data);
      } else {
        setMergedFiles([]);
      }
    } catch (error) {
      setMergedFiles([]);
    } finally {
      setLoadingState('mergedFiles', false);
    }
  };

  const demergePDF = async (filename) => {
    setLoadingState('demerge', true);
    try {
      const result = await apiCall(`/demerge/split/${filename}`, {
        method: 'POST',
        body: JSON.stringify(demergeSettings)
      });
      
      if (result.success) {
        showMessage(`Split successful! Generated ${result.data.separatedFiles.length} files`, 'success');
        await loadMergedFiles();
      } else {
        throw new Error(result.error || 'Split failed');
      }
    } catch (error) {
      showMessage(`Split failed: ${error.message}`, 'error');
    } finally {
      setLoadingState('demerge', false);
    }
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
                    placeholder="Enter absolute path (e.g., /Users/username/Downloads)"
                    className="path-input"
                  />
                </label>
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
          <h1><i className="fas fa-envelope-open-text"></i> Email to PDF Converter</h1>
        </header>

        <div className="main-content">
          <div className="card">
            <h3><i className="fas fa-inbox"></i> Email List</h3>
            <div className="button-group">
              <button 
                className="btn" 
                onClick={loadEmails}
                disabled={loading.emails}
              >
                {loading.emails ? <span className="loading"></span> : <i className="fas fa-refresh"></i>}
                Refresh Emails
              </button>
              <button 
                className="btn" 
                onClick={handleToAuthUrl}
                disabled={loading.auth}
              >
                {loading.auth ? <span className="loading"></span> : <i className="fas fa-key"></i>}
                Gmail Auth
              </button>
            </div>
            
            <div className="email-list">
              {emails.length === 0 ? (
                <div className="empty-state">
                  <i className="fas fa-envelope fa-3x"></i>
                  <p>Click "Refresh Emails" to load your Gmail messages</p>
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
                    <div className="email-snippet">{email.snippet}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <h3><i className="fas fa-cogs"></i> Operations</h3>
            <div className="button-group">
              <button 
                className="btn" 
                onClick={() => {
                  setShowDemergePanel(!showDemergePanel);
                  if (!showDemergePanel) loadMergedFiles();
                }}
                disabled={loading.mergedFiles}
              >
                {loading.mergedFiles ? <span className="loading"></span> : <i className="fas fa-scissors"></i>}
                PDF Split Tool {showDemergePanel ? '▲' : '▼'}
              </button>
              {renderDownloadSettings()}
            </div>

            {selectedEmail && (
              <div className="selected-email-info">
                <h4>Selected Email</h4>
                <div className="email-details">
                  <div><strong>Subject:</strong> {selectedEmail.subject}</div>
                  <div><strong>From:</strong> {selectedEmail.from}</div>
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
                    Convert to PDF
                  </button>
                </div>
              </div>
            )}

            {showDemergePanel && (
              <div className="demerge-panel">
                <h4>PDF Split Tool</h4>
                <p>Split merged PDF files back into original email and attachments</p>
                
                {mergedFiles.length === 0 ? (
                  <div className="empty-state">
                    <i className="fas fa-file-pdf fa-2x"></i>
                    <p>No merged PDF files found</p>
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
                    <h5>Split Settings - {selectedMergedFile.filename}</h5>
                    <div className="setting-group">
                      <label>
                        Email pages count:
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
                      <label>Attachment Information:</label>
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
                            placeholder="Pages"
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
                            Remove
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
                        <i className="fas fa-plus"></i> Add Attachment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;