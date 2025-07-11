const API_BASE = process.env.REACT_APP_API_URL || 'https://email-pdf-convert.onrender.com/api';

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
    throw error;
  }
};

// Auth APIs
export const authApi = {
  startGmailAuth: async () => {
    const response = await fetch(`${API_BASE}/auth/gmail/start`);
    return await response.json();
  },
  
  startOutlookAuth: async () => {
    const response = await fetch(`${API_BASE}/auth/outlook/start`);
    return await response.json();
  }
};

// Email APIs
export const emailApi = {
  getProviders: async () => {
    return await apiCall('/emails/providers');
  },
  
  getEmailList: async (sessionId, provider, maxResults = 20) => {
    return await apiCall(`/emails/list?sessionId=${sessionId}&provider=${provider}&maxResults=${maxResults}`);
  },
  
  getEmailDetails: async (messageId, sessionId, provider) => {
    return await apiCall(`/emails/${messageId}?sessionId=${sessionId}&provider=${provider}`);
  },
  
  getProcessingStatus: async (messageId, sessionId) => {
    return await apiCall(`/emails/${messageId}/processing-status?sessionId=${sessionId}`);
  },
  
  convertMultiple: async (sessionId, provider, messageIds, pdfRule) => {
    return await apiCall('/emails/convert-multiple', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        provider,
        messageIds,
        pdfRule
      })
    });
  },
  
  autoProcess: async (sessionId, provider, maxEmails, pdfRule) => {
    return await apiCall('/emails/auto-process', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        provider,
        maxEmails,
        pdfRule
      })
    });
  },
  
  getPdfRules: async () => {
    return await apiCall('/emails/pdf-rules');
  },
  
  getWebhookStatus: async (sessionId) => {
    return await apiCall(`/emails/webhook/status?sessionId=${sessionId}`);
  }
};

export default {
  authApi,
  emailApi
};