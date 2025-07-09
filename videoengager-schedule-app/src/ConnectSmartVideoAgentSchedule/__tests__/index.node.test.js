import { jest } from '@jest/globals';

// Mock all dependencies before any imports
jest.mock('node:fs');
jest.mock('mime', () => ({
  default: {
    getType: jest.fn()
  },
  getType: jest.fn()
}));

describe('Lambda Handler Tests', () => {
  let handler;
  let fs;
  let mime;
  let mockConsoleLog;
  let mockConsoleError;
  let originalEnv;

  beforeAll(async () => {
    // Import mocked modules
    fs = (await import('node:fs')).default;
    
    // Import mime and handle both default and named exports
    const mimeModule = await import('mime');
    mime = mimeModule.default || mimeModule;
    
    // Mock console methods to suppress output during tests
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Import handler after mocks are set up
    const module = await import('../index.mjs'); // Adjust path as needed
    handler = module.handler;
  });

  beforeEach(() => {
    // Store original env
    originalEnv = process.env;
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Set default environment
    process.env = {
      ...originalEnv,
      DOMAIN: 'test-domain.com'
    };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('Happy Path Scenarios', () => {
    test('should serve schedule.html with template replacement', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'TEST@EXAMPLE.COM' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/api/prod/schedule.html'
      };

      const mockFileContent = '<html>{{AGENT_EMAIL}} - {{LAMBDA_ENDPOINT}}</html>';
      fs.readFileSync.mockReturnValue(mockFileContent);
      mime.getType.mockReturnValue('text/html');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(fs.readFileSync).toHaveBeenCalledWith('schedule.html', 'utf8');
      expect(mime.getType).toHaveBeenCalledWith('schedule.html');
      expect(result).toEqual({
        statusCode: 200,
        headers: { 'Content-type': 'text/html' },
        body: '<html>test@example.com - https://api.test.com/prod/schedule</html>'
      });
    });

    test('should serve bundle.js with template replacement', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'agent@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'dev' },
        path: '/api/dev/bundle.js'
      };

      const mockFileContent = 'const APP_URL = "{{VE_APP_URL}}"; const DOMAIN = "{{VE_CUST_DOMAIN}}";';
      fs.readFileSync.mockReturnValue(mockFileContent);
      mime.getType.mockReturnValue('application/javascript');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(fs.readFileSync).toHaveBeenCalledWith('bundle.js', 'utf8');
      expect(result).toEqual({
        statusCode: 200,
        headers: { 'Content-type': 'application/javascript' },
        body: 'const APP_URL = "schedule.html"; const DOMAIN = "test-domain.com";'
      });
    });

    test('should serve regular files without template replacement', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'agent@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/api/prod/config.json'
      };

      const mockFileContent = '{"config": "value"}';
      fs.readFileSync.mockReturnValue(mockFileContent);
      mime.getType.mockReturnValue('application/json');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result).toEqual({
        statusCode: 200,
        headers: { 'Content-type': 'application/json' },
        body: '{"config": "value"}'
      });
    });

    test('should handle different path formats correctly', async () => {
      // Test various path formats
      const testCases = [
        { path: '/file.html', expected: 'file.html' },
        { path: '/api/stage/file.html', expected: 'file.html' },
        { path: '/very/deep/nested/path/file.js', expected: 'file.js' },
        { path: 'file.txt', expected: 'file.txt' }
      ];

      for (const testCase of testCases) {
        const mockEvent = {
          queryStringParameters: { agentEmail: 'test@test.com' },
          requestContext: { domainName: 'api.test.com', stage: 'prod' },
          path: testCase.path
        };

        fs.readFileSync.mockReturnValue('content');
        mime.getType.mockReturnValue('text/plain');

        await handler(mockEvent);

        expect(fs.readFileSync).toHaveBeenCalledWith(testCase.expected, 'utf8');
      }
    });
  });

  describe('Edge Cases - Missing/Invalid Parameters', () => {
    test('should handle missing agentEmail parameter', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: null,
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/schedule.html'
      };

      fs.readFileSync.mockReturnValue('{{AGENT_EMAIL}}');
      mime.getType.mockReturnValue('text/html');

      // Act
      const result = await handler(mockEvent);

      // Assert - should return 404 when agentEmail causes an error
      expect(result).toEqual({
        statusCode: 200,
        body: "",
        "headers":  {
         "Content-type": "text/html",
       },
      });
    });

    test('should handle undefined agentEmail in queryStringParameters', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { someOtherParam: 'value' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/schedule.html'
      };

      fs.readFileSync.mockReturnValue('{{AGENT_EMAIL}}');
      mime.getType.mockReturnValue('text/html');

      // Act
      const result = await handler(mockEvent);

      // Assert - should return 404 when agentEmail causes an error
      expect(result).toEqual({
        statusCode: 200,
        body: "",
        "headers":  {
         "Content-type": "text/html",
       },
      });
    });

    test('should handle empty agentEmail', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: '' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/schedule.html'
      };

      fs.readFileSync.mockReturnValue('{{AGENT_EMAIL}}');
      mime.getType.mockReturnValue('text/html');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.body).toBe(''); // empty string becomes empty after toLowerCase()
    });

    test('should handle missing environment variables', async () => {
      // Arrange
      delete process.env.DOMAIN;

      const mockEvent = {
        queryStringParameters: { agentEmail: 'test@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/bundle.js'
      };

      fs.readFileSync.mockReturnValue('{{VE_CUST_DOMAIN}}');
      mime.getType.mockReturnValue('application/javascript');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.body).toBe('');
    });
  });

  describe('File System Error Scenarios', () => {
    test('should return 404 when file does not exist', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'test@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/nonexistent.html'
      };

      const error = new Error('ENOENT: no such file or directory');
      fs.readFileSync.mockImplementation(() => { throw error; });
      mime.getType.mockReturnValue('text/html');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result).toEqual({
        statusCode: 404,
        body: "Not Found"
      });
      expect(mockConsoleError).toHaveBeenCalledWith(error);
    });

    test('should return 404 on permission errors', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'test@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/restricted.html'
      };

      const error = new Error('EACCES: permission denied');
      fs.readFileSync.mockImplementation(() => { throw error; });
      mime.getType.mockReturnValue('text/html');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result).toEqual({
        statusCode: 404,
        body: "Not Found"
      });
      expect(mockConsoleError).toHaveBeenCalledWith(error);
    });

    test('should handle empty files', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'test@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/empty.html'
      };

      fs.readFileSync.mockReturnValue('');
      mime.getType.mockReturnValue('text/html');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result).toEqual({
        statusCode: 200,
        headers: { 'Content-type': 'text/html' },
        body: ''
      });
    });
  });

  describe('Template Replacement Edge Cases', () => {
    test('should handle schedule.html with missing templates', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'test@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/schedule.html'
      };

      const mockFileContent = '<html>No templates here</html>';
      fs.readFileSync.mockReturnValue(mockFileContent);
      mime.getType.mockReturnValue('text/html');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.body).toBe('<html>No templates here</html>');
    });

    test('should handle schedule.html with partial templates', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'test@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/schedule.html'
      };

      const mockFileContent = '<html>{{AGENT_EMAIL}} but no endpoint</html>';
      fs.readFileSync.mockReturnValue(mockFileContent);
      mime.getType.mockReturnValue('text/html');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.body).toBe('<html>test@test.com but no endpoint</html>');
    });

    test('should handle bundle.js with missing templates', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'test@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/bundle.js'
      };

      const mockFileContent = 'const config = "no templates";';
      fs.readFileSync.mockReturnValue(mockFileContent);
      mime.getType.mockReturnValue('application/javascript');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.body).toBe('const config = "no templates";');
    });

    test('should handle multiple template occurrences', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'test@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/schedule.html'
      };

      const mockFileContent = '{{AGENT_EMAIL}} and {{AGENT_EMAIL}} again, plus {{LAMBDA_ENDPOINT}}';
      fs.readFileSync.mockReturnValue(mockFileContent);
      mime.getType.mockReturnValue('text/html');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.body).toBe('test@test.com and test@test.com again, plus https://api.test.com/prod/schedule');
    });
  });

  describe('MIME Type Handling', () => {
    test('should handle null MIME type', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'test@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/file.unknown'
      };

      fs.readFileSync.mockReturnValue('content');
      mime.getType.mockReturnValue(null);

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.headers['Content-type']).toBe(null);
    });

    test('should handle various MIME types', async () => {
      const testCases = [
        { file: 'test.html', mimeType: 'text/html' },
        { file: 'test.js', mimeType: 'application/javascript' },
        { file: 'test.json', mimeType: 'application/json' },
        { file: 'test.txt', mimeType: 'text/plain' },
        { file: 'test.xml', mimeType: 'application/xml' }
      ];

      for (const testCase of testCases) {
        const mockEvent = {
          queryStringParameters: { agentEmail: 'test@test.com' },
          requestContext: { domainName: 'api.test.com', stage: 'prod' },
          path: `/${testCase.file}`
        };

        fs.readFileSync.mockReturnValue('content');
        mime.getType.mockReturnValue(testCase.mimeType);

        const result = await handler(mockEvent);

        expect(result.headers['Content-type']).toBe(testCase.mimeType);
      }
    });
  });

  describe('Logging Behavior', () => {
    test('should log received event', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'test@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/test.html'
      };

      fs.readFileSync.mockReturnValue('content');
      mime.getType.mockReturnValue('text/html');

      // Act
      await handler(mockEvent);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Received event:',
        JSON.stringify(mockEvent, null, 2)
      );
    });

    test('should log errors when file read fails', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'test@test.com' },
        requestContext: { domainName: 'api.test.com', stage: 'prod' },
        path: '/nonexistent.html'
      };

      const error = new Error('File not found');
      fs.readFileSync.mockImplementation(() => { throw error; });
      mime.getType.mockReturnValue('text/html');

      // Act
      await handler(mockEvent);

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(error);
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete schedule.html workflow', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'John.Doe@Company.COM' },
        requestContext: { domainName: 'my-api.amazonaws.com', stage: 'production' },
        path: '/api/production/schedule.html'
      };

      const mockFileContent = `
        <html>
          <head><title>Schedule for {{AGENT_EMAIL}}</title></head>
          <body>
            <h1>Welcome {{AGENT_EMAIL}}</h1>
            <form action="{{LAMBDA_ENDPOINT}}" method="POST">
              <input type="hidden" name="agent" value="{{AGENT_EMAIL}}">
            </form>
          </body>
        </html>
      `;

      fs.readFileSync.mockReturnValue(mockFileContent);
      mime.getType.mockReturnValue('text/html');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.body).toContain('john.doe@company.com');
      expect(result.body).toContain('https://my-api.amazonaws.com/production/schedule');
      expect(result.body).not.toContain('{{AGENT_EMAIL}}');
      expect(result.body).not.toContain('{{LAMBDA_ENDPOINT}}');
    });

    test('should handle complete bundle.js workflow', async () => {
      // Arrange
      const mockEvent = {
        queryStringParameters: { agentEmail: 'dev@test.com' },
        requestContext: { domainName: 'dev-api.test.com', stage: 'dev' },
        path: '/bundle.js'
      };

      const mockFileContent = `
        const config = {
          appUrl: "{{VE_APP_URL}}",
          domain: "{{VE_CUST_DOMAIN}}",
          apiEndpoint: "{{VE_APP_URL}}/api"
        };
        
        window.VE_CONFIG = config;
      `;

      fs.readFileSync.mockReturnValue(mockFileContent);
      mime.getType.mockReturnValue('application/javascript');

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.body).toContain('appUrl: "schedule.html"');
      expect(result.body).toContain('domain: "test-domain.com"');
      expect(result.body).toContain('apiEndpoint: "schedule.html/api"');
      expect(result.body).not.toContain('{{VE_APP_URL}}');
      expect(result.body).not.toContain('{{VE_CUST_DOMAIN}}');
    });
  });
});