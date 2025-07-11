import React, { useState, useEffect } from 'react';
import './App.css';
import { authApi, emailApi } from './api';

function App() {
  const [emails, setEmails] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [loading, setLoading] = useState({});
  const [messages, setMessages] = useState([]);
  const [currentProvider, setCurrentProvider] = useState('gmail');
  const [providers, setProviders] = useState([]);
  const [processingSettings, setProcessingSettings] = useState({
    pdfRule: 'mainbody_with_attachment'
  });
  const [webhookStatus, setWebhookStatus] = useState(null);
  const [pdfRules, setPdfRules] = useState([]);
  const [emailDetails, setEmailDetails] = useState({});
  const [conversionStatus, setConversionStatus] = useState({});
  const [autoProcessStatus, setAutoProcessStatus] = useState({
    enabled: false,
    isProcessing: false,
    config: {
      pdfRule: 'mainbody_with_attachment',
      maxEmailsPerRun: 5,
      intervalMinutes: 30
    },
    lastRunTime: null
  });
  const [autoProcessInterval, setAutoProcessInterval] = useState(null);

  const loadProviders = async () => {
    try {
      const result = await emailApi.getProviders();
      if (result.success && result.data && result.data.providers) {
        setProviders(result.data.providers);
      } else {
        setProviders(['gmail', 'outlook']);
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
      setProviders(['gmail', 'outlook']);
    }
  };

  const fetchWebhookStatus = async () => {
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) return;
  
    try {
      const res = await emailApi.getWebhookStatus(sessionId);
      if (res.success) {
        setWebhookStatus(res.data);
      } else {
        showMessage('Failed to fetch webhook status', 'error');
      }
    } catch (err) {
      console.error('Webhook status error:', err);
      showMessage('Error fetching webhook status', 'error');
    }
  };
    
  useEffect(() => {
    if (localStorage.getItem('sessionId')) {
      fetchWebhookStatus();
    }
  }, [currentProvider]);
  

  const handleToAuthUrl = async () => {
    try {
      setLoadingState('auth', true);
      
      const res = currentProvider === 'outlook' 
        ? await authApi.startOutlookAuth() 
        : await authApi.startGmailAuth();
      
      console.log('Response data:', res);
      
      if (res.authUrl && res.sessionId) {
        localStorage.setItem('sessionId', res.sessionId);
        localStorage.setItem('currentProvider', currentProvider);
        window.open(res.authUrl, '_blank');
        showMessage(`Please complete ${currentProvider} authentication in the new window`, 'info');
      } else {
        throw new Error(`Invalid response: ${JSON.stringify(res)}`);
      }
    } catch (error) {
      console.error('Auth URL error details:', error);
      showMessage(`Failed to get authentication URL: ${error.message}`, 'error');
    } finally {
      setLoadingState('auth', false);
    }
  };

  const handleAutoProcess = async () => {
    try {
      setLoadingState('convert', true);
      const sessionId = localStorage.getItem('sessionId');
  
      const res = await emailApi.autoProcess(
        sessionId,
        currentProvider,
        10,
        processingSettings.pdfRule
      );
  
      if (res.success && res.data.step === 'completed') {
        showMessage(`Successfully processed ${res.data.processedEmails} out of ${res.data.totalEmails} ${currentProvider} emails`, 'success');
        await refreshConversionStatus();
      } else if (res.data?.authUrl) {
        localStorage.setItem('sessionId', res.data.sessionId);
        const authWindow = window.open(res.data.authUrl, '_blank');
  
        const timer = setInterval(() => {
          if (authWindow?.closed) {
            clearInterval(timer);
            handleAutoProcess();
          }
        }, 1000);
      } else {
        throw new Error(res.error || 'Processing failed');
      }
    } catch (error) {
      console.error('Auto process failed:', error);
      showMessage('Auto processing failed: ' + error.message, 'error');
    } finally {
      setLoadingState('convert', false);
    }
  };

  const loadAutoProcessStatus = () => {
    const stored = localStorage.getItem('autoProcessConfig');
    const storedProvider = localStorage.getItem('currentProvider');
    
    if (storedProvider) {
      setCurrentProvider(storedProvider);
    }
    
    if (stored) {
      const config = JSON.parse(stored);
      setAutoProcessStatus(prev => ({
        ...prev,
        ...config,
        isProcessing: false
      }));
      
      if (config.enabled) {
        startAutoProcessTimer(config.intervalMinutes);
      }
    }
  };

  const saveAutoProcessStatus = (status) => {
    localStorage.setItem('autoProcessConfig', JSON.stringify(status));
  };

  const startAutoProcessTimer = (intervalMinutes = 30) => {
    if (autoProcessInterval) {
      clearInterval(autoProcessInterval);
    }
    
    const interval = setInterval(async () => {
      const sessionId = localStorage.getItem('sessionId');
      if (!sessionId) {
        stopAutoProcess();
        return;
      }
      
      await runAutoProcess();
    }, intervalMinutes * 60 * 1000);
    
    setAutoProcessInterval(interval);
  };

  const runAutoProcessWithConfig = async (config = autoProcessStatus) => {
    if (config.isProcessing) {
      return;
    }
    
    setAutoProcessStatus(prev => ({ ...prev, isProcessing: true }));
    
    try {
      const sessionId = localStorage.getItem('sessionId');
      
      const res = await emailApi.autoProcess(
        sessionId,
        currentProvider,
        config.config.maxEmailsPerRun,
        config.config.pdfRule
      );

      if (res.success && res.data.step === 'completed') {
        showMessage(`Auto processed ${res.data.processedEmails} out of ${res.data.totalEmails} ${currentProvider} emails`, 'success');
        
        const updatedStatus = {
          ...config,
          lastRunTime: new Date().toISOString()
        };
        setAutoProcessStatus(updatedStatus);
        saveAutoProcessStatus(updatedStatus);
        
        await refreshConversionStatus();
      } else {
        showMessage('Auto processing completed with no new emails', 'info');
      }
    } catch (error) {
      console.error('Auto process failed:', error);
      showMessage('Auto processing failed: ' + error.message, 'error');
    } finally {
      setAutoProcessStatus(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const runAutoProcess = async () => {
    await runAutoProcessWithConfig();
  };

  const startAutoProcess = async () => {
    const sessionId = localStorage.getItem('sessionId');
    
    if (!sessionId) {
      showMessage('Please authenticate first', 'error');
      return;
    }

    const newStatus = {
      enabled: true,
      isProcessing: false,
      config: {
        ...autoProcessStatus.config,
        pdfRule: processingSettings.pdfRule
      },
      lastRunTime: null
    };
    
    setAutoProcessStatus(newStatus);
    saveAutoProcessStatus(newStatus);
    startAutoProcessTimer(newStatus.config.intervalMinutes);
    
    await runAutoProcessWithConfig(newStatus);
    
    showMessage(`Auto processing started for ${currentProvider}! Will check for new emails every ${newStatus.config.intervalMinutes} minutes.`, 'success');
  };

  const stopAutoProcess = () => {
    if (autoProcessInterval) {
      clearInterval(autoProcessInterval);
      setAutoProcessInterval(null);
    }
    
    const newStatus = {
      ...autoProcessStatus,
      enabled: false,
      isProcessing: false
    };
    
    setAutoProcessStatus(newStatus);
    saveAutoProcessStatus(newStatus);
    
    showMessage('Auto processing stopped', 'info');
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US');
  };

  const formatLastRunTime = (isoString) => {
    if (!isoString) return 'Never';
    return new Date(isoString).toLocaleString('en-US');
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


  const loadPdfRules = async () => {
    try {
      const result = await emailApi.getPdfRules();
      if (result.success && result.data && result.data.rules) {
        setPdfRules(result.data.rules);
      } else {
        setPdfRules(['mainbody_with_attachment', 'mainbody_separate_attachment', 'attachment_only']);
      }
    } catch (error) {
      console.error('Failed to load PDF rules:', error);
      setPdfRules(['mainbody_with_attachment', 'mainbody_separate_attachment', 'attachment_only']);
      showMessage('Using default PDF processing rules', 'info');
    }
  };

  const getPdfRuleLabel = (rule) => {
    const labels = {
      'mainbody_with_attachment': 'Merge email + attachments',
      'mainbody_separate_attachment': 'Separate email & attachments', 
      'attachment_only': 'Attachments only'
    };
    return labels[rule] || rule;
  };

  const getPdfRuleDescription = (rule) => {
    const descriptions = {
      'mainbody_with_attachment': 'Combine email body and PDF attachments into one file',
      'mainbody_separate_attachment': 'Create separate PDFs for email and each attachment',
      'attachment_only': 'Process only PDF attachments, skip email body'
    };
    return descriptions[rule] || '';
  };

  const loadEmailDetails = async () => {
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId || emails.length === 0) return;

    setLoadingState('emailDetails', true);
    try {
      const details = {};
      const status = {};
      
      for (const email of emails) {
        try {
          const detailResponse = await emailApi.getEmailDetails(email.messageId, sessionId, currentProvider);
          if (detailResponse.success) {
            details[email.messageId] = detailResponse.data;
          }

          try {
            const statusResponse = await emailApi.getProcessingStatus(email.messageId, sessionId);
            if (statusResponse.success) {
              status[email.messageId] = statusResponse.data;
            } else {
              status[email.messageId] = { status: 'not_processed' };
            }
          } catch (statusError) {
            console.warn(`Failed to get status for ${email.messageId}:`, statusError);
            status[email.messageId] = { status: 'not_processed' };
          }
        } catch (error) {
          console.error(`Failed to load details for email ${email.messageId}:`, error);
          details[email.messageId] = { attachments: [], hasPdfAttachment: false };
          status[email.messageId] = { status: 'error' };
        }
      }
      
      setEmailDetails(details);
      setConversionStatus(status);
    } catch (error) {
      console.error('Failed to load email details:', error);
    } finally {
      setLoadingState('emailDetails', false);
    }
  };

  const refreshConversionStatus = async () => {
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId || emails.length === 0) return;

    try {
      const status = {};
      
      for (const email of emails) {
        try {
          const statusResponse = await emailApi.getProcessingStatus(email.messageId, sessionId);
          if (statusResponse.success) {
            status[email.messageId] = statusResponse.data;
          } else {
            status[email.messageId] = { status: 'not_processed' };
          }
        } catch (statusError) {
          console.warn(`Failed to refresh status for ${email.messageId}:`, statusError);
          status[email.messageId] = conversionStatus[email.messageId] || { status: 'not_processed' };
        }
      }
      
      setConversionStatus(status);
    } catch (error) {
      console.error('Failed to refresh conversion status:', error);
    }
  };

  const convertSelectedEmails = async () => {
    if (!selectedEmails || selectedEmails.length === 0) {
      showMessage('Please select at least one email.', 'error');
      return;
    }
  
    setLoadingState('convertSelected', true);
    try {
      const sessionId = localStorage.getItem('sessionId');
      if (!sessionId) {
        throw new Error('Missing session ID');
      }
      const updatedStatus = { ...conversionStatus };
      selectedEmails.forEach(email => {
        updatedStatus[email.messageId] = { status: 'processing' };
      });
      setConversionStatus(updatedStatus);
  
      const result = await emailApi.convertMultiple(
        sessionId,
        currentProvider,
        selectedEmails.map(e => e.messageId),
        processingSettings.pdfRule
      );
  
      if (result.success) {
        showMessage(`Converted ${result.data.length} ${currentProvider} email(s) successfully using ${getPdfRuleLabel(processingSettings.pdfRule)}.`, 'success');
        
        await refreshConversionStatus();

        result.data.forEach((emailRes) => {
          if (emailRes.pdfUrls && emailRes.pdfUrls.length > 0) {
            showMessage(`${emailRes.subject} → ${emailRes.pdfUrls.length} PDF(s) created`, 'info');
          }
        });
      } else {
        throw new Error(result.error || 'Conversion failed');
      }
    } catch (error) {
      console.error('Bulk conversion error:', error);
      showMessage(`Conversion failed: ${error.message}`, 'error');
      
      const errorStatus = { ...conversionStatus };
      selectedEmails.forEach(email => {
        errorStatus[email.messageId] = { status: 'error' };
      });
      setConversionStatus(errorStatus);
    } finally {
      setLoadingState('convertSelected', false);
    }
  };

  useEffect(() => {
    loadProviders();
    loadPdfRules();
    autoLoadEmails();
    loadAutoProcessStatus();
  }, []);

  useEffect(() => {
    if (emails.length > 0) {
      loadEmailDetails();
    }
  }, [emails, currentProvider]);

  useEffect(() => {
    return () => {
      if (autoProcessInterval) {
        clearInterval(autoProcessInterval);
      }
    };
  }, [autoProcessInterval]);
  

  const autoLoadEmails = async () => {
    const sessionId = localStorage.getItem('sessionId');
    if (sessionId) {
      await loadEmails();
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
      const response = await emailApi.getEmailList(sessionId, currentProvider, 20);
      if (response.success) {
        setEmails(response.data.emails);
        showMessage(`Auto-loaded ${response.data.emails.length} ${currentProvider} emails`, 'success');
      } else {
        throw new Error(response.error || 'Failed to load emails');
      }
    } catch (error) {
      console.error('Failed to load emails:', error);
      setEmails([]);
    } finally {
      setLoadingState('emails', false);
    }
  };

  const toggleEmailSelection = (email) => {
    setSelectedEmails(prev => {
      const exists = prev.find(e => e.messageId === email.messageId);
      if (exists) {
        return prev.filter(e => e.messageId !== email.messageId);
      } else {
        return [...prev, email];
      }
    });
  };

  const getPdfAttachmentCount = (messageId) => {
    const details = emailDetails[messageId];
    if (!details || !details.attachments) return 0;
    return details.attachments.filter(att => att.mimeType === 'application/pdf').length;
  };

  const getConversionStatusDisplay = (messageId, rule) => {
    const status = conversionStatus[messageId];
    if (!status || !status.ruleStatus) {
      return { text: 'Not Processed', className: 'status-not-processed' };
    }
  
    const ruleStatus = status.ruleStatus[rule];
    if (!ruleStatus) {
      return { text: 'Not Processed', className: 'status-not-processed' };
    }
  
    if (ruleStatus.processing) {
      return { text: 'Processing...', className: 'status-processing' };
    }
  
    if (ruleStatus.processed) {
      const pdfCount = ruleStatus.filePaths ? ruleStatus.filePaths.length : 0;
      return { text: `Converted (${pdfCount})`, className: 'status-completed' };
    }
  
    if (ruleStatus.failed) {
      return { text: 'Error', className: 'status-error' };
    }
  
    return { text: 'Not Processed', className: 'status-not-processed' };
  };

  const handleProviderChange = (newProvider) => {
    if (newProvider !== currentProvider) {
      setCurrentProvider(newProvider);
      localStorage.setItem('currentProvider', newProvider);
      setEmails([]);
      setSelectedEmails([]);
      setEmailDetails({});
      setConversionStatus({});
      showMessage(`Switched to ${newProvider}. Please authenticate to load emails.`, 'info');
    }
  };

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
          <h1><i className="fas fa-envelope-open-text"></i> Multi-Provider Email to PDF Converter</h1>
        </header>

        <div className="main-content">
          <div className="card">
            <h3><i className="fas fa-link"></i> Email Provider</h3>
            <div className="button-group">
              {providers.map(provider => (
                <button
                  key={provider}
                  className={`btn ${currentProvider === provider ? 'btn-primary' : ''}`}
                  onClick={() => handleProviderChange(provider)}
                  disabled={currentProvider === provider}
                >
                  <i className={`fas fa-${provider === 'gmail' ? 'envelope' : 'mail-bulk'}`}></i>
                  {provider === 'gmail' ? 'Gmail' : 'Outlook'}
                </button>
              ))}
            </div>
            <p>Current provider: <strong>{currentProvider}</strong></p>
          </div>

          <div className="card">
            <h3><i className="fas fa-user-check"></i> Authentication & Quick Actions</h3>
            <div className="button-group">
              <button 
                className="btn" 
                onClick={handleToAuthUrl}
                disabled={loading.auth}
              >
                {loading.auth ? <span className="loading"></span> : <i className="fas fa-key"></i>}
                Authenticate {currentProvider}
              </button>
              <button 
                className="btn" 
                onClick={loadEmails}
                disabled={loading.emails}
              >
                {loading.emails ? <span className="loading"></span> : <i className="fas fa-refresh"></i>}
                Refresh Emails
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleAutoProcess}
                disabled={loading.convert}
              >
                {loading.convert ? <span className="loading"></span> : <i className="fas fa-magic"></i>}
                Process (5 emails)
              </button>
              <button 
                className={`btn ${autoProcessStatus.enabled ? 'btn-danger' : 'btn-success'}`}
                onClick={autoProcessStatus.enabled ? stopAutoProcess : startAutoProcess}
                disabled={autoProcessStatus.isProcessing}
                title={autoProcessStatus.enabled ? 'Stop automatic processing' : 'Start automatic processing'}
              >
                {autoProcessStatus.isProcessing ? (
                  <span className="loading"></span>
                ) : (
                  <i className={`fas fa-${autoProcessStatus.enabled ? 'stop' : 'play'}`}></i>
                )}
                {autoProcessStatus.enabled ? 'Stop Auto Process' : 'Start Auto Process'}
                {autoProcessStatus.isProcessing && (
                  <span className="processing-indicator"> (Running...)</span>
                )}
              </button>
            </div>
          </div>

          <div className="card">
            <h3><i className="fas fa-cogs"></i> PDF Processing Settings</h3>
            <div className="processing-settings-panel">
              <div className="setting-group">
                <label className="setting-label">Choose Processing Rule:</label>
                {pdfRules.length === 0 ? (
                  <div className="loading-rules">Loading processing rules...</div>
                ) : (
                  <div className="processing-options">
                    {pdfRules.map(rule => (
                      <div key={rule} className="processing-option">
                        <label className="radio-option">
                          <input 
                            type="radio"
                            name="pdfRule"
                            value={rule}
                            checked={processingSettings.pdfRule === rule}
                            onChange={(e) => {
                              setProcessingSettings({
                                ...processingSettings,
                                pdfRule: e.target.value
                              });
                              showMessage(`Processing rule changed to: ${getPdfRuleLabel(e.target.value)}`, 'info');
                              
                              if (autoProcessStatus.enabled) {
                                const updatedStatus = {
                                  ...autoProcessStatus,
                                  config: {
                                    ...autoProcessStatus.config,
                                    pdfRule: e.target.value
                                  }
                                };
                                setAutoProcessStatus(updatedStatus);
                                saveAutoProcessStatus(updatedStatus);
                                runAutoProcessWithConfig(updatedStatus);
                              }
                            }}
                          />
                          <span className="radio-custom"></span>
                          <div className="option-content">
                            <div className="option-title">{getPdfRuleLabel(rule)}</div>
                            <div className="option-description">{getPdfRuleDescription(rule)}</div>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="settings-preview">
                <div className="preview-item">
                  <strong>Current Processing Mode:</strong> {getPdfRuleLabel(processingSettings.pdfRule)}
                </div>
                <div className="preview-description">
                  {getPdfRuleDescription(processingSettings.pdfRule)}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3><i className="fas fa-robot"></i> Auto Processing Status for {currentProvider}</h3>
            <div className="auto-process-status">
              <div className="status-row">
                <span className="status-label">Status:</span>
                <span className={`status-value ${autoProcessStatus.enabled ? 'enabled' : 'disabled'}`}>
                  <i className={`fas fa-circle ${autoProcessStatus.enabled ? 'text-success' : 'text-muted'}`}></i>
                  {autoProcessStatus.enabled ? 'Enabled' : 'Disabled'}
                  {autoProcessStatus.isProcessing && (
                    <span className="processing-text"> - Processing emails...</span>
                  )}
                </span>
              </div>
              
              {autoProcessStatus.enabled && (
                <>
                  <div className="status-row">
                    <span className="status-label">Processing Rule:</span>
                    <span className="status-value">{getPdfRuleLabel(autoProcessStatus.config.pdfRule)}</span>
                  </div>
                  <div className="status-row">
                    <span className="status-label">Check Interval:</span>
                    <span className="status-value">{autoProcessStatus.config.intervalMinutes} minutes</span>
                  </div>
                  <div className="status-row">
                    <span className="status-label">Max Emails per Run:</span>
                    <span className="status-value">{autoProcessStatus.config.maxEmailsPerRun}</span>
                  </div>
                  <div className="status-row">
                    <span className="status-label">Last Run:</span>
                    <span className="status-value">{formatLastRunTime(autoProcessStatus.lastRunTime)}</span>
                  </div>
                </>
              )}
              
              <div className="auto-process-info">
                <i className="fas fa-info-circle"></i>
                <span>
                  {autoProcessStatus.enabled 
                    ? `Auto processing will check for new ${currentProvider} emails every ${autoProcessStatus.config.intervalMinutes} minutes and convert them automatically.`
                    : `Start auto processing to automatically convert new ${currentProvider} emails as they arrive.`
                  }
                </span>
              </div>
            </div>
          </div>

          {/* <div className="card">
  <h3><i className="fas fa-bolt"></i> Webhook Subscription Status</h3>
  {webhookStatus ? (
    <div className="webhook-status">
      <div className="status-row">
        <span className="status-label">Is Active:</span>
        <span className="status-value">
          <i className={`fas fa-circle ${webhookStatus.isActive ? 'text-success' : 'text-muted'}`}></i>
          {webhookStatus.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="status-row">
        <span className="status-label">Subscription ID:</span>
        <span className="status-value">{webhookStatus.subscriptionId || 'N/A'}</span>
      </div>
      <div className="status-row">
        <span className="status-label">Webhook URL:</span>
        <span className="status-value small-font">{webhookStatus.webhookUrl || 'N/A'}</span>
      </div>
      <div className="status-row">
        <span className="status-label">Expiration:</span>
        <span className="status-value">{webhookStatus.expirationDateTime ? formatDate(webhookStatus.expirationDateTime) : 'N/A'}</span>
      </div>
      <div className="status-row">
        <span className="status-label">PDF Rule:</span>
        <span className="status-value">{getPdfRuleLabel(webhookStatus.pdfRule)}</span>
      </div>
      <div className="status-row">
        <span className="status-label">Output Directory:</span>
        <span className="status-value">{webhookStatus.outputDir || 'default'}</span>
      </div>
      <div className="status-row">
        <span className="status-label">Notify URL:</span>
        <span className="status-value small-font">{webhookStatus.notifyUrl || 'none'}</span>
      </div>
    </div>
  ) : (
    <p>Loading webhook status...</p>
  )}
</div> */}


          <div className="card">
            <h3><i className="fas fa-inbox"></i> {currentProvider} Email List</h3>
            
            {emails.length > 0 && (
              <div className="table-controls">
                <div className="select-all">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedEmails.length === emails.length && emails.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedEmails(emails);
                          showMessage(`Selected all ${emails.length} emails`, 'info');
                        } else {
                          setSelectedEmails([]);
                          showMessage('Deselected all emails', 'info');
                        }
                      }}
                    />
                    <span className="checkbox-custom"></span>
                    Select All ({emails.length} emails)
                  </label>
                </div>
                
                {selectedEmails.length > 0 && (
                  <button 
                    className="btn btn-success" 
                    onClick={convertSelectedEmails}
                    disabled={loading.convertSelected}
                  >
                    {loading.convertSelected ? (
                      <>
                        <span className="loading"></span>
                        Converting...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-file-pdf"></i>
                        Convert {selectedEmails.length} Email{selectedEmails.length > 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            <div className="email-table-container">
              {emails.length === 0 ? (
                <div className="empty-state">
                  <i className="fas fa-envelope fa-3x"></i>
                  <p>
                    {loading.emails ? 
                      'Loading emails...' : 
                      `Click "Authenticate ${currentProvider}" to get started. Emails will auto-load after authentication.`
                    }
                  </p>
                </div>
              ) : (
                <table className="email-table">
                  <thead>
                    <tr>
                      <th className="select-column">
                        <i className="fas fa-check"></i>
                      </th>
                      <th className="subject-column">Subject</th>
                      <th className="from-column">From</th>
                      <th className="date-column">Date</th>
                      <th className="pdf-attachments-column">PDF Attachments</th>
                      <th className="status-column">Merge Status</th>
                      <th className="status-column">Separate Status</th>
                      <th className="status-column">Attachment Only Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emails.map((email) => {
                      const isSelected = selectedEmails.find(e => e.messageId === email.messageId);
                      const pdfCount = getPdfAttachmentCount(email.messageId);
                      const mergeStatus = getConversionStatusDisplay(email.messageId, 'mainbody_with_attachment');
                      const separateStatus = getConversionStatusDisplay(email.messageId, 'mainbody_separate_attachment');
                      const attachmentOnlyStatus = getConversionStatusDisplay(email.messageId, 'attachment_only');
                      const isLoading = loading.emailDetails;
                      
                      return (
                        <tr key={email.messageId} className={`email-row ${isSelected ? 'selected' : ''}`}>
                          <td className="select-column">
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={selectedEmails.some(e => e.messageId === email.messageId)}
                                onChange={() => toggleEmailSelection(email)}
                              />
                              <span className="checkbox-custom"></span>
                            </label>
                          </td>
                          <td className="subject-column">
                            <div className="email-subject" title={email.subject || '(No subject)'}>
                              {email.subject || '(No subject)'}
                            </div>
                            <div className="email-snippet">{email.snippet}</div>
                          </td>
                          <td className="from-column">
                            <div className="email-from" title={email.from}>
                              {email.from}
                            </div>
                          </td>
                          <td className="date-column">
                            <div className="email-date">
                              {formatDate(email.date)}
                            </div>
                          </td>
                          <td className="pdf-attachments-column">
                            <div className="pdf-count">
                              {isLoading ? (
                                <span className="loading-small"></span>
                              ) : (
                                <>
                                  <i className="fas fa-file-pdf"></i>
                                  <span className="count">{pdfCount}</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="status-column">
                            <span className={`status-badge ${mergeStatus.className}`}>
                              {mergeStatus.text}
                            </span>
                          </td>
                          <td className="status-column">
                            <span className={`status-badge ${separateStatus.className}`}>
                              {separateStatus.text}
                            </span>
                          </td>
                          <td className="status-column">
                            <span className={`status-badge ${attachmentOnlyStatus.className}`}>
                              {attachmentOnlyStatus.text}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;