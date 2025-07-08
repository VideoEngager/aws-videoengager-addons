import { ConnectClient, StartTaskContactCommand } from "@aws-sdk/client-connect";

// Custom error classes
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

export const handler = async (event) => {
  const requestId = event.requestContext?.requestId || 'unknown';
  
  try {
    console.log(`[${requestId}] Received event:`, JSON.stringify(event, null, 2));
    
    // Validate HTTP method and path
    validateHttpRequest(event);
    
    // Validate and parse request body
    const body = validateAndParseBody(event.body);
    
    // Validate environment variables
    validateEnvironmentVariables();
    
    // Extract and validate required parameters
    const {
      instanceId,
      flowId,
      PAK,
      ExternalId,
      agentEmail,
      meetingTime
    } = extractAndValidateParameters(body);
    
    console.log(`[${requestId}] Processing request for agent: ${agentEmail}, meeting time: ${meetingTime.toISOString()}`);
    
    // Authenticate with external service
    const authToken = await login(PAK, ExternalId, agentEmail);
    if (!authToken) {
      throw new ValidationError("Authentication failed");
    }
    
    // Create VE schedule
    const veScheduleData = await createVeSchedule(authToken, body);
    if (veScheduleData?.status !== 200) {
      throw new ValidationError(`VE scheduling failed with ${veScheduleData?.status}: ${veScheduleData?.data?.error || veScheduleData?.data?.message || 'Unknown error'}`);
    }
    
    if (!veScheduleData.data?._id) {
      throw new ValidationError("VE schedule created but no ID returned");
    }
    
    const veVisitorId = veScheduleData.data._id;
    const customerName = body.visitor.name;
    
    // Create AWS Connect task
    await createConnectTask(instanceId, flowId, customerName, meetingTime, veVisitorId, body, requestId, authToken);
    
    console.log(`[${requestId}] Successfully created schedule and task for ${customerName}`);
    
    const returnResponseObj = {
      ...veScheduleData.data,
      visitor: {
        ...veScheduleData.data.visitor,
        name: body.visitor?.name || undefined,
        email: body.visitor?.email || undefined,
        phone: body.visitor?.phone || undefined
      }
    };
    return createSuccessResponse(returnResponseObj);
    
  } catch (error) {
    console.error(`[${requestId}] Error processing request:`, {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    return createErrorResponse(error);
  }
};

function validateHttpRequest(event) {
  if (!event.requestContext) {
    throw new ValidationError("Missing request context");
  }
  
  if (event.requestContext.httpMethod !== "POST") {
    throw new ValidationError("Only POST method is allowed");
  }
  
  if (event.requestContext.resourcePath !== "/schedule") {
    throw new ValidationError("Invalid resource path");
  }
}

function validateAndParseBody(eventBody) {
  if (!eventBody) {
    throw new ValidationError("Request body is required");
  }
  
  let body;
  try {
    body = JSON.parse(eventBody);
  } catch (parseError) {
    throw new ValidationError("Invalid JSON format");
  }
  
  // Validate required fields in body
  const requiredFields = ['agentEmail', 'date', 'visitor', 'duration'];
  for (const field of requiredFields) {
    if (!body[field]) {
      throw new ValidationError(`${field} is required`);
    }
  }
  
  // Validate visitor object
  if (!body.visitor || typeof body.visitor !== 'object') {
    throw new ValidationError("visitor must be an object");
  }
  
  const requiredVisitorFields = ['name', 'email', 'phone'];
  for (const field of requiredVisitorFields) {
    if (!body.visitor[field]) {
      throw new ValidationError(`visitor ${field} is required`);
    }
  }
  
  // Validate email formats
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.agentEmail)) {
    throw new ValidationError("Please enter a valid email address for agent email");
  }
  if (!emailRegex.test(body.visitor.email)) {
    throw new ValidationError("Please enter a valid email address for visitor email");
  }
  
  // Validate duration
  const duration = parseInt(body.duration);
  if (isNaN(duration) || duration < 15) {
    throw new ValidationError("Meeting duration must be at least 15 minutes");
  }
  
  // Validate date
  const date = new Date(body.date);
  if (isNaN(date.getTime())) {
    throw new ValidationError("Please enter a valid date");
  }
  
  // Check if date is in the future
  if (date <= new Date()) {
    throw new ValidationError("Please select a date in the future");
  }

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 6);
  if (date > maxDate) {
    throw new ValidationError("Please select a date within the next 6 days");
  }
  
  return body;
}

function validateEnvironmentVariables() {
  const requiredEnvVars = ['PAK', 'EXTERNAL_ID', 'VE_BASE_URL'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
  }
}

function extractAndValidateParameters(body) {
  const instanceId = body.instanceId || process.env.INSTANCE_ID;
  const flowId = body.flowId || process.env.FLOW_ID;
  const PAK = process.env.PAK;
  const ExternalId = process.env.EXTERNAL_ID;
  const agentEmail = body.agentEmail;
  const meetingTime = new Date(body.date);
  
  if (!instanceId) {
    throw new ValidationError("instanceId is required");
  }
  if (!flowId) {
    throw new ValidationError("flowId is required");
  }
  
  return {
    instanceId,
    flowId,
    PAK,
    ExternalId,
    agentEmail,
    meetingTime
  };
}

async function createConnectTask(instanceId, flowId, customerName, meetingTime, veVisitorId, body, requestId, authToken) {
  const client = new ConnectClient();
  
  const scheduleCommand = new StartTaskContactCommand({
    InstanceId: instanceId,
    Name: `Video Call with ${customerName}`,
    ContactFlowId: flowId,
    Description: "Scheduled video conference",
    ScheduledTime: meetingTime,
    Attributes: {
      veVisitorId: veVisitorId,
      visitorName: body.visitor.name,
      visitorEmail: body.visitor.email,
      visitorPhone: body.visitor.phone,
      visitorSubject: body.visitor.subject
    }
  });
  
  console.log(`[${requestId}] Creating Connect task for ${customerName}`);
  
  try {
    const scheduleResponse = await client.send(scheduleCommand);
    console.log(`[${requestId}] Connect task created successfully:`, scheduleResponse.ContactId);
    return scheduleResponse;
    
  } catch (error) {
    console.error(`[${requestId}] Connect task creation failed, attempting cleanup`);
    console.error(`[${requestId}] AWS Connect Error:`, error);
    
    // Attempt to cleanup VE schedule
    try {
      await deleteVeSchedule(authToken, veVisitorId);
      console.log(`[${requestId}] VE schedule cleanup successful`);
    } catch (cleanupError) {
      console.error(`[${requestId}] VE schedule cleanup failed:`, cleanupError);
    }
    
    throw new ValidationError("Failed to create Connect task");
  }
}

function createSuccessResponse(data) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    },
    body: JSON.stringify({
      success: true,
      ...data
    })
  };
}

function createErrorResponse(error,) {
  let statusCode = 500;
  let userMessage = "Something went wrong while scheduling the meeting. Please try again.";
  
  // Show validation error messages to users with 400 status
  if (error instanceof ValidationError) {
    statusCode = 400;
    userMessage = error.message;
  }
  
  return {
    statusCode: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    },
    body: JSON.stringify({
      success: false,
      message: userMessage
    })
  };
}

function makeRequest(method, url, data = null, queryParams = {}, authToken) {
  const queryString = Object.keys(queryParams)
    .filter(key => 
      queryParams[key] !== '' && 
      queryParams[key] !== null && 
      queryParams[key] !== undefined
    )
    .map(key => 
      `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`
    )
    .join('&');

  const fullUrl = queryString ? `${url}?${queryString}` : url;

  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  return fetch(fullUrl, options)
    .then(response => {
      return response.json().then(data => ({
        status: response.status,
        data: data
      }));
    })
    .catch(error => ({
      status: 0,
      data: { error: error.message }
    }));
}

async function authenticateWithPak(pak, externalId, email) {
  const url = `${process.env.VE_BASE_URL}/api/partners/impersonate/${pak}/${externalId}/${email}`;
  return await makeRequest('GET', url);
}

async function login(PAK, externalId, agentEmail) {
  if (!PAK || !externalId || !agentEmail) {
    console.error('Missing PAK, external ID, or agent email');
    return null;
  }
  
  try {
    const response = await authenticateWithPak(PAK, externalId, agentEmail);
    
    if (response.status === 200 && response.data.token) {
      return response.data.token;
    } else {
      console.error('Authentication failed:', response.data);
      return null;
    }
  } catch (error) {
    console.error('Login error:', error);
    return null;
  }
}

async function createVeSchedule(token, data) {
  const queryParams = { agentEmail: data.agentEmail };
  
  const veScheduleData = { 
    date: data.date,
    duration: data.duration,
    visitor: {
      name: "",
      email: "",
      phone: ""
    }
  };

  const response = await makeRequest(
    'POST',
    `${process.env.VE_BASE_URL}/api/schedules/my/`,
    veScheduleData,
    queryParams,
    token
  );
  
  return response;
}

async function deleteVeSchedule(token, id) {
  const response = await makeRequest(
    'DELETE',
    `${process.env.VE_BASE_URL}/api/schedules/my/${id}`,
    null,
    {},
    token
  );
  
  return response;
}