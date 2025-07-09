module.exports = {
  projects: [
    // Frontend tests
    {
      displayName: 'Frontend',
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/src/frontend-setup-tests.js'],
      testMatch: [
        '<rootDir>/src/**/*.frontend.(test|spec).js',
        '<rootDir>/src/**/__tests__/**/*.frontend.(test|spec).js',
        '!<rootDir>/src/**/*.node.test.js'
      ],
      collectCoverageFrom: [
        'src/**/*.{js,jsx}',
        '!src/frontend-setup-tests.js',
        '!src/**/*.test.{js,jsx}',
        '!src/**/__tests__/**',
        '!src/**/*.mjs', // Exclude Lambda files
        '!src/**/*.node.test.js'
      ],
      moduleNameMapping: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
      },
      transform: {
        '^.+\\.(js|jsx)$': 'babel-jest'
      }
    },
    
    // Backend/Lambda tests  
    {
      displayName: 'Backend',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/src/node-setup-tests.js'],
      testMatch: [
        '<rootDir>/src/**/*.node.(test|spec).js',
        '<rootDir>/src/**/__tests__/**/*.node.(test|spec).js',
        '!<rootDir>/src/**/*.frontend.test.js'
      ],
      collectCoverageFrom: [
        'src/**/*.mjs', // Include Lambda files
        '!src/**/*.test.js',
        '!src/**/*.node.test.js',
        '!src/node-setup-tests.js',
      ],
      transform: {
        '^.+\\.(js|mjs)$': 'babel-jest'
      }
    }
  ],
  
  // Global coverage settings
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70, 
      lines: 70,
      statements: 70
    }
  }
};