// src/ConnectTaskScheduler/__tests__/index/index.node.test.js

import { jest } from '@jest/globals';

// Mock fetch globally first
global.fetch = jest.fn();

// Create mock functions for AWS SDK
const mockSend = jest.fn();
const mockConnectClient = jest.fn();
const mockStartTaskContactCommand = jest.fn();

// Mock the AWS SDK module before importing the handler
jest.mock('@aws-sdk/client-connect', () => ({
  ConnectClient: mockConnectClient,
  StartTaskContactCommand: mockStartTaskContactCommand
}), { virtual: true });

describe('Lambda Handler Integration Tests', () => {
  let handler;
  
  beforeAll(async () => {
    // Set up mocks before importing
    mockConnectClient.mockImplementation(() => ({
      send: mockSend
    }));
    mockStartTaskContactCommand.mockImplementation((params) => params);
    
    // Import handler after mocks are set up
    const module = await import('../../index.mjs');
    handler = module.handler;
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default environment variables
    process.env.PAK = 'test-pak';
    process.env.EXTERNAL_ID = 'test-external-id';
    process.env.VE_BASE_URL = 'https://test-ve.com';
    process.env.INSTANCE_ID = 'test-instance-id';
    process.env.FLOW_ID = 'test-flow-id';
    process.env.AWS_REGION = 'us-east-1';
    
    // Reset mock implementations
    mockConnectClient.mockImplementation(() => ({
      send: mockSend
    }));
    mockStartTaskContactCommand.mockImplementation((params) => params);
    
    // Default fetch responses
    global.fetch.mockImplementation((url, options) => {
      if (url.includes('/api/partners/impersonate/')) {
        return Promise.resolve({
          json: () => Promise.resolve({ token: 'test-auth-token' }),
          status: 200
        });
      }
      if (url.includes('/api/schedules/my/') && options?.method === 'POST') {
        return Promise.resolve({
          json: () => Promise.resolve({ 
            _id: 'test-schedule-id',
            date: '2024-01-01T10:00:00Z',
            duration: 30,
            visitor: { name: '', email: '', phone: '' }
          }),
          status: 200
        });
      }
      if (url.includes('/api/schedules/my/') && options?.method === 'DELETE') {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true }),
          status: 200
        });
      }
      return Promise.reject(new Error('Unexpected fetch call: ' + url));
    });
    
    // Default AWS Connect success
    mockSend.mockResolvedValue({ ContactId: 'test-contact-id' });
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.PAK;
    delete process.env.EXTERNAL_ID;
    delete process.env.VE_BASE_URL;
    delete process.env.INSTANCE_ID;
    delete process.env.FLOW_ID;
    delete process.env.AWS_REGION;
  });

  const createValidEvent = (overrides = {}) => ({
    requestContext: {
      requestId: 'test-request-id',
      httpMethod: 'POST',
      resourcePath: '/schedule'
    },
    body: JSON.stringify({
      agentEmail: 'agent@test.com',
      date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      duration: 30,
      visitor: {
        name: 'John Doe',
        email: 'visitor@test.com',
        phone: '+1234567890',
        subject: 'Test meeting'
      },
      ...overrides
    })
  });

  describe('Happy Path - Successful Flow', () => {
    test('should create schedule and task successfully', async () => {
      const event = createValidEvent();
      
      const result = await handler(event);
      
      // Should return success response
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
      
      // Should authenticate with VE
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/partners/impersonate/test-pak/test-external-id/agent@test.com'),
        expect.objectContaining({ method: 'GET' })
      );
      
      // Should create VE schedule with NO visitor data
      const veScheduleCall = global.fetch.mock.calls.find(call => 
        call[0].includes('/api/schedules/my/') && call[1].method === 'POST'
      );
      expect(veScheduleCall).toBeDefined();
      
      const veScheduleData = JSON.parse(veScheduleCall[1].body);
      expect(veScheduleData.visitor).toEqual({
        name: "",
        email: "",
        phone: ""
      });
      expect(veScheduleData.date).toBeDefined();
      expect(veScheduleData.duration).toBe(30);
      
      // Should create AWS Connect task with visitor data in attributes
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          InstanceId: 'test-instance-id',
          ContactFlowId: 'test-flow-id',
          Name: 'Video Call with John Doe',
          Attributes: {
            veVisitorId: 'test-schedule-id',
            visitorName: 'John Doe',
            visitorEmail: 'visitor@test.com',
            visitorPhone: '+1234567890',
            visitorSubject: 'Test meeting'
          }
        })
      );
    });

    test('should use instanceId and flowId from request body when provided', async () => {
      const event = createValidEvent({
        instanceId: 'custom-instance-id',
        flowId: 'custom-flow-id'
      });
      
      await handler(event);
      
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          InstanceId: 'custom-instance-id',
          ContactFlowId: 'custom-flow-id'
        })
      );
    });
  });

  describe('HTTP Request Validation', () => {
    test('should reject non-POST requests', async () => {
      const event = {
        ...createValidEvent(),
        requestContext: {
          ...createValidEvent().requestContext,
          httpMethod: 'GET'
        }
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Only POST method is allowed');
    });

    test('should reject invalid resource path', async () => {
      const event = {
        ...createValidEvent(),
        requestContext: {
          ...createValidEvent().requestContext,
          resourcePath: '/invalid'
        }
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid resource path');
    });

    test('should reject missing request context', async () => {
      const event = {
        ...createValidEvent(),
        requestContext: undefined
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Missing request context');
    });
  });

  describe('Request Body Validation', () => {
    test('should reject missing body', async () => {
      const event = {
        ...createValidEvent(),
        body: null
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Request body is required');
    });

    test('should reject invalid JSON', async () => {
      const event = {
        ...createValidEvent(),
        body: 'invalid json'
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid JSON format');
    });

    test('should reject missing required fields', async () => {
      const requiredFields = ['agentEmail', 'date', 'visitor', 'duration'];
      
      for (const field of requiredFields) {
        const bodyData = {
          agentEmail: 'agent@test.com',
          date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          duration: 30,
          visitor: {
            name: 'John Doe',
            email: 'visitor@test.com',
            phone: '+1234567890'
          }
        };
        delete bodyData[field];
        
        const event = {
          ...createValidEvent(),
          body: JSON.stringify(bodyData)
        };
        
        const result = await handler(event);
        
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body).message).toBe(`${field} is required`);
      }
    });

    test('should reject invalid visitor object', async () => {
      const event = createValidEvent({ visitor: "not an object" });
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('visitor must be an object');
    });

    test('should reject missing visitor fields', async () => {
      const requiredVisitorFields = ['name', 'email', 'phone'];
      
      for (const field of requiredVisitorFields) {
        const visitor = {
          name: 'John Doe',
          email: 'visitor@test.com',
          phone: '+1234567890'
        };
        delete visitor[field];
        
        const event = createValidEvent({ visitor });
        
        const result = await handler(event);
        
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body).message).toBe(`visitor ${field} is required`);
      }
    });

    test('should reject invalid email formats', async () => {
      // Invalid agent email
      let event = createValidEvent({ agentEmail: 'invalid-email' });
      let result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Please enter a valid email address for agent email');
      
      // Invalid visitor email
      event = createValidEvent({ 
        visitor: {
          name: 'John Doe',
          email: 'invalid-email',
          phone: '+1234567890'
        }
      });
      result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Please enter a valid email address for visitor email');
    });

    test('should reject invalid duration', async () => {
      // Too short duration
      let event = createValidEvent({ duration: 10 });
      let result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Meeting duration must be at least 15 minutes');
      
      // Non-numeric duration
      event = createValidEvent({ duration: 'invalid' });
      result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Meeting duration must be at least 15 minutes');
    });

    test('should reject invalid dates', async () => {
      // Invalid date format
      let event = createValidEvent({ date: 'invalid-date' });
      let result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Please enter a valid date');
      
      // Past date
      event = createValidEvent({ date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() });
      result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Please select a date in the future');
      
      // Date too far in future (more than 6 days)
      event = createValidEvent({ date: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString() });
      result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Please select a date within the next 6 days');
    });
  });

  describe('Environment Variables Validation', () => {
    test('should reject missing environment variables', async () => {
      delete process.env.PAK;
      delete process.env.EXTERNAL_ID;
      delete process.env.VE_BASE_URL;
      
      const event = createValidEvent();
      const result = await handler(event);
      
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).success).toBe(false);
    });

    test('should reject missing instanceId and flowId', async () => {
      delete process.env.INSTANCE_ID;
      delete process.env.FLOW_ID;
      
      const event = createValidEvent();
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('instanceId is required');
    });
  });

  describe('Authentication Flow', () => {
    test('should handle authentication failure', async () => {
      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/partners/impersonate/')) {
          return Promise.resolve({
            json: () => Promise.resolve({ error: 'Authentication failed' }),
            status: 401
          });
        }
        return Promise.reject(new Error('Unexpected fetch call'));
      });
      
      const event = createValidEvent();
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Authentication failed');
    });

    test('should handle authentication network error', async () => {
      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/partners/impersonate/')) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.reject(new Error('Unexpected fetch call'));
      });
      
      const event = createValidEvent();
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Authentication failed');
    });
  });

  describe('VE Schedule Creation', () => {
    test('should handle VE schedule creation failure', async () => {
      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/partners/impersonate/')) {
          return Promise.resolve({
            json: () => Promise.resolve({ token: 'test-auth-token' }),
            status: 200
          });
        }
        if (url.includes('/api/schedules/my/') && options.method === 'POST') {
          return Promise.resolve({
            json: () => Promise.resolve({ error: 'Schedule creation failed' }),
            status: 400
          });
        }
        return Promise.reject(new Error('Unexpected fetch call'));
      });
      
      const event = createValidEvent();
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('VE scheduling failed');
    });

    test('should handle VE schedule creation without ID', async () => {
      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/partners/impersonate/')) {
          return Promise.resolve({
            json: () => Promise.resolve({ token: 'test-auth-token' }),
            status: 200
          });
        }
        if (url.includes('/api/schedules/my/') && options.method === 'POST') {
          return Promise.resolve({
            json: () => Promise.resolve({ success: true }), // No _id field
            status: 200
          });
        }
        return Promise.reject(new Error('Unexpected fetch call'));
      });
      
      const event = createValidEvent();
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('VE schedule created but no ID returned');
    });
  });

  describe('AWS Connect Task Creation and Cleanup', () => {
    test('should cleanup VE schedule if Connect task creation fails', async () => {
      // Mock VE schedule deletion
      const deleteVeScheduleCalls = [];
      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/partners/impersonate/')) {
          return Promise.resolve({
            json: () => Promise.resolve({ token: 'test-auth-token' }),
            status: 200
          });
        }
        if (url.includes('/api/schedules/my/') && options.method === 'POST') {
          return Promise.resolve({
            json: () => Promise.resolve({ _id: 'test-schedule-id' }),
            status: 200
          });
        }
        if (url.includes('/api/schedules/my/test-schedule-id') && options.method === 'DELETE') {
          deleteVeScheduleCalls.push({ url, options });
          return Promise.resolve({
            json: () => Promise.resolve({ success: true }),
            status: 200
          });
        }
        return Promise.reject(new Error('Unexpected fetch call'));
      });
      
      // Mock Connect task creation failure
      mockSend.mockRejectedValue(new Error('AWS Connect error'));
      
      const event = createValidEvent();
      const result = await handler(event);
      
      // Should return error
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Failed to create Connect task');
      
      // Should attempt to cleanup VE schedule
      expect(deleteVeScheduleCalls).toHaveLength(1);
      expect(deleteVeScheduleCalls[0].url).toContain('/api/schedules/my/test-schedule-id');
      expect(deleteVeScheduleCalls[0].options.method).toBe('DELETE');
    });

    test('should handle cleanup failure gracefully', async () => {
      // Mock VE schedule deletion failure
      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/partners/impersonate/')) {
          return Promise.resolve({
            json: () => Promise.resolve({ token: 'test-auth-token' }),
            status: 200
          });
        }
        if (url.includes('/api/schedules/my/') && options.method === 'POST') {
          return Promise.resolve({
            json: () => Promise.resolve({ _id: 'test-schedule-id' }),
            status: 200
          });
        }
        if (url.includes('/api/schedules/my/test-schedule-id') && options.method === 'DELETE') {
          return Promise.reject(new Error('Cleanup failed'));
        }
        return Promise.reject(new Error('Unexpected fetch call'));
      });
      
      // Mock Connect task creation failure
      mockSend.mockRejectedValue(new Error('AWS Connect error'));
      
      const event = createValidEvent();
      const result = await handler(event);
      
      // Should still return the main error, not the cleanup error
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Failed to create Connect task');
    });
  });

  describe('Response Format', () => {
    test('should return proper success response format', async () => {
      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/partners/impersonate/')) {
          return Promise.resolve({
            json: () => Promise.resolve({ token: 'test-auth-token' }),
            status: 200
          });
        }
        if (url.includes('/api/schedules/my/') && options.method === 'POST') {
          return Promise.resolve({
            json: () => Promise.resolve({ 
              _id: 'test-schedule-id',
              date: '2024-01-01T10:00:00Z',
              duration: 30,
              visitor: { name: '', email: '', phone: '' }
            }),
            status: 200
          });
        }
        return Promise.reject(new Error('Unexpected fetch call'));
      });
      
      const event = createValidEvent();
      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      expect(result.headers).toEqual({
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
      });
      
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body._id).toBe('test-schedule-id');
      expect(body.visitor.name).toBe('John Doe'); // Should include visitor data in response
      expect(body.visitor.email).toBe('visitor@test.com');
      expect(body.visitor.phone).toBe('+1234567890');
    });

    test('should return proper error response format', async () => {
      const event = {
        ...createValidEvent(),
        body: null
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      expect(result.headers).toEqual({
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
      });
      
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Request body is required');
    });

    test('should return generic error message for non-validation errors', async () => {
      // Make Connect client constructor throw an error early in the flow
      delete process.env.PAK; // This will cause an environment validation error (500)
      
      const event = createValidEvent();
      const result = await handler(event);
      
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Something went wrong while scheduling the meeting. Please try again.');
    });
  });

  describe('Data Privacy - Visitor Data Handling', () => {
    test('should ensure visitor data is NOT sent to VE backend', async () => {
      const event = createValidEvent({
        visitor: {
          name: 'Sensitive Name',
          email: 'sensitive@private.com',
          phone: '+1999999999',
          subject: 'Confidential meeting'
        }
      });
      
      await handler(event);
      
      // Find the VE schedule creation call
      const veScheduleCall = global.fetch.mock.calls.find(call => 
        call[0].includes('/api/schedules/my/') && call[1].method === 'POST'
      );
      
      expect(veScheduleCall).toBeDefined();
      const veScheduleData = JSON.parse(veScheduleCall[1].body);
      
      // Verify NO visitor data is sent to VE
      expect(veScheduleData.visitor).toEqual({
        name: "",
        email: "",
        phone: ""
      });
      
      // But visitor data should be in AWS Connect task attributes
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Attributes: expect.objectContaining({
            visitorName: 'Sensitive Name',
            visitorEmail: 'sensitive@private.com',
            visitorPhone: '+1999999999',
            visitorSubject: 'Confidential meeting'
          })
        })
      );
    });
  });
});